using System.Collections.Concurrent;
using System.Security.Cryptography;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Options;

namespace Bingo;

/// <summary>Single-process storage. Each lobby gate covers mutations AND personalized emissions.</summary>
public sealed class LobbyStore(IHubContext<BingoHub> hub, TimeProvider clock, IOptions<BingoOptions> options)
{
    private sealed class Entry(BingoGame game)
    {
        public BingoGame Game { get; } = game;
        public SemaphoreSlim Gate { get; } = new(1, 1);
    }
    private sealed record Membership(string Code, string PlayerId);
    private readonly ConcurrentDictionary<string, Entry> lobbies = new();
    private readonly ConcurrentDictionary<string, Membership> memberships = new();
    private readonly ConcurrentDictionary<string, byte> connections = new();
    private readonly SemaphoreSlim creationGate = new(1, 1);
    private readonly TimeSpan grace = TimeSpan.FromSeconds(options.Value.DisconnectGraceSeconds);
    public int Count => lobbies.Count;

    public void RegisterConnection(string connectionId)
    {
        if (!connections.TryAdd(connectionId, 0)) return;
        if (connections.Count > 5000)
        {
            connections.TryRemove(connectionId, out _);
            throw new BingoException("Le serveur est occupé. Réessayez dans un instant.");
        }
    }

    public async Task<Session> CreateAsync(string connectionId, string name, int color)
    {
        RequireUnbound(connectionId);
        await creationGate.WaitAsync();
        Entry entry;
        try
        {
            if (lobbies.Count >= options.Value.MaxLobbies)
                throw new BingoException("Le serveur est occupé. Réessayez dans un instant.");
            string code;
            do { code = NewCode(); } while (lobbies.ContainsKey(code));
            var game = new BingoGame(code, name, color, clock.GetUtcNow());
            entry = new Entry(game);
            // Lock before publishing to the dictionary, so Inspect cannot observe a half-created lobby.
            await entry.Gate.WaitAsync();
            lobbies[code] = entry;
        }
        finally { creationGate.Release(); }
        try
        {
            var host = entry.Game.Players[0];
            Attach(connectionId, entry.Game, host);
            await BroadcastAsync(entry.Game);
            return entry.Game.SessionFor(host);
        }
        finally { entry.Gate.Release(); }
    }

    public Task<Session> JoinAsync(string connectionId, string code, string name, int color) =>
        WithCodeAsync(code, async game =>
        {
            RequireUnbound(connectionId);
            var player = game.Join(name, color);
            Attach(connectionId, game, player);
            await BroadcastAsync(game);
            return game.SessionFor(player);
        });

    public Task<Session> RecoverAsync(string connectionId, string code, string name, string? hostKey) =>
        WithCodeAsync(code, async game =>
        {
            RequireUnbound(connectionId);
            var player = game.Recover(name, hostKey);
            Attach(connectionId, game, player);
            await BroadcastAsync(game);
            return game.SessionFor(player);
        });

    public Task<Session> ResumeAsync(string connectionId, string code, string token) =>
        WithCodeAsync(code, async game =>
        {
            var player = game.Resume(token);
            if (memberships.TryGetValue(connectionId, out var existing))
            {
                if (existing.Code != game.Code || existing.PlayerId != player.Id)
                    throw new BingoException("Cet onglet est déjà connecté à une autre place.");
                return game.SessionFor(player);
            }
            Attach(connectionId, game, player);
            await BroadcastAsync(game);
            return game.SessionFor(player);
        });

    public Task<PublicLobby> InspectAsync(string code) => WithCodeAsync(code, game => Task.FromResult(game.Inspect()));
    public Task<Snapshot> GetStateAsync(string connectionId) => WithMemberAsync(connectionId,
        (game, actorId) => Task.FromResult(game.Snapshot(actorId)));

    public Task CommandAsync(string connectionId, Action<BingoGame, string> command) => WithMemberAsync(connectionId,
        async (game, actorId) =>
        {
            var revision = game.Revision;
            command(game, actorId);
            if (game.Revision != revision) await BroadcastAsync(game);
            return true;
        });

    public Task SetValidationAsync(string connectionId, string cellId, bool validated) => WithMemberAsync(connectionId,
        async (game, actorId) =>
        {
            var revision = game.Revision;
            var activated = game.SetValidation(actorId, cellId, validated);
            if (game.Revision != revision) await BroadcastAsync(game);
            if (activated.Length > 0)
                await SendAsync(hub.Clients.Clients(ConnectionIds(game)), "CombinationsActivated", new Activation(game.Revision, activated));
            return true;
        });

    public Task KickAsync(string connectionId, string playerId) => WithMemberAsync(connectionId,
        async (game, actorId) =>
        {
            game.RequireHost(actorId);
            var targets = game.Players.FirstOrDefault(p => p.Id == playerId)?.Connections.ToArray() ?? [];
            game.Kick(actorId, playerId);
            foreach (var target in targets) memberships.TryRemove(target, out _);
            if (targets.Length > 0) await SendAsync(hub.Clients.Clients(targets), "Removed", "L’hôte vous a retiré du lobby.");
            await BroadcastAsync(game);
            return true;
        });

    public Task CloseAsync(string connectionId) => WithMemberAsync(connectionId,
        async (game, actorId) =>
        {
            game.RequireHost(actorId);
            await CloseGameAsync(game, "L’hôte a fermé le lobby.");
            return true;
        });

    public async Task DisconnectAsync(string connectionId)
    {
        connections.TryRemove(connectionId, out _);
        if (!memberships.TryRemove(connectionId, out var membership) || !lobbies.TryGetValue(membership.Code, out var entry)) return;
        await entry.Gate.WaitAsync();
        try
        {
            if (entry.Game.IsClosed) return;
            entry.Game.Disconnect(membership.PlayerId, connectionId, clock.GetUtcNow());
            await BroadcastAsync(entry.Game);
        }
        finally { entry.Gate.Release(); }
    }

    public Task CleanupAsync() => Task.WhenAll(lobbies.Values.Select(CleanupEntryAsync));

    private async Task CleanupEntryAsync(Entry entry)
    {
        // A busy lobby must not delay expiry of every other lobby. Commands also check expiry.
        if (!await entry.Gate.WaitAsync(0)) return;
        try
        {
            if (entry.Game.IsClosed) return;
            if (entry.Game.ExpirationReason(clock.GetUtcNow(), grace) is { } reason)
                await CloseGameAsync(entry.Game, reason);
        }
        finally { entry.Gate.Release(); }
    }

    private async Task<T> WithCodeAsync<T>(string code, Func<BingoGame, Task<T>> action)
    {
        code = NormalizeCode(code);
        if (!lobbies.TryGetValue(code, out var entry)) throw Missing();
        await entry.Gate.WaitAsync();
        try
        {
            if (entry.Game.IsClosed) throw Missing();
            if (entry.Game.ExpirationReason(clock.GetUtcNow(), grace) is { } reason)
            {
                await CloseGameAsync(entry.Game, reason);
                throw new BingoException(reason);
            }
            return await action(entry.Game);
        }
        finally { entry.Gate.Release(); }
    }

    private Task<T> WithMemberAsync<T>(string connectionId, Func<BingoGame, string, Task<T>> action)
    {
        if (!memberships.TryGetValue(connectionId, out var member))
            throw new BingoException("Reconnectez-vous au lobby pour continuer.");
        return WithCodeAsync(member.Code, game =>
        {
            // Membership may have been removed while waiting for the lobby gate (kick/close).
            if (!memberships.TryGetValue(connectionId, out var current) || current != member)
                throw new BingoException("Vous ne faites plus partie de ce lobby.");
            return action(game, member.PlayerId);
        });
    }

    private void Attach(string connectionId, BingoGame game, Player player)
    {
        RequireUnbound(connectionId);
        if (player.Connections.Count >= 5) throw new BingoException("Trop d’onglets ouverts pour cette place. Fermez-en un.");
        if (!memberships.TryAdd(connectionId, new Membership(game.Code, player.Id)))
            throw new BingoException("Cet onglet est déjà connecté à un lobby.");
        game.Connect(player.Id, connectionId, clock.GetUtcNow());
        // Handle disconnect racing the invocation, without leaving a permanently connected ghost.
        if (!connections.ContainsKey(connectionId))
        {
            memberships.TryRemove(connectionId, out _);
            game.Disconnect(player.Id, connectionId, clock.GetUtcNow());
            throw new BingoException("La connexion a été interrompue. Reconnectez-vous.");
        }
    }

    private void RequireUnbound(string connectionId)
    {
        if (!connections.ContainsKey(connectionId)) throw new BingoException("La connexion a été interrompue.");
        if (memberships.ContainsKey(connectionId)) throw new BingoException("Cet onglet est déjà connecté à un lobby.");
    }

    private Task BroadcastAsync(BingoGame game) => Task.WhenAll(game.Players
        .Where(player => player.Connections.Count > 0)
        .Select(player => SendAsync(hub.Clients.Clients(player.Connections.ToArray()), "State", game.Snapshot(player.Id))));

    private async Task CloseGameAsync(BingoGame game, string reason)
    {
        var ids = ConnectionIds(game);
        game.Close();
        lobbies.TryRemove(game.Code, out _);
        foreach (var id in ids) memberships.TryRemove(id, out _);
        if (ids.Length > 0) await SendAsync(hub.Clients.Clients(ids), "Closed", reason);
    }

    private static async Task SendAsync(IClientProxy clients, string eventName, object payload)
    {
        // A slow phone cannot hold a lobby lock indefinitely. Its next snapshot/reconnect repairs state.
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        try { await clients.SendCoreAsync(eventName, [payload], timeout.Token); }
        catch (OperationCanceledException) when (timeout.IsCancellationRequested) { }
    }

    private static string[] ConnectionIds(BingoGame game) => game.Players.SelectMany(p => p.Connections).ToArray();
    private static BingoException Missing() => new("Ce lobby n’existe plus. Il a peut-être été fermé ou le serveur a redémarré.");
    private static string NormalizeCode(string? code)
    {
        if (code is null || code.Length > 12) throw new BingoException("Le code du lobby doit contenir 6 caractères.");
        code = code.Trim().ToUpperInvariant();
        if (code.Length != 6 || code.Any(c => !char.IsAsciiLetterOrDigit(c)))
            throw new BingoException("Le code du lobby doit contenir 6 caractères.");
        return code;
    }
    private static string NewCode()
    {
        const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        return new string(Enumerable.Range(0, 6).Select(_ => alphabet[RandomNumberGenerator.GetInt32(alphabet.Length)]).ToArray());
    }
}
