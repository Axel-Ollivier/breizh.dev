using Microsoft.AspNetCore.SignalR;

namespace Bingo;

public sealed class BingoHub(LobbyStore store, TimeProvider clock) : Hub
{
    public override async Task OnConnectedAsync()
    {
        try { store.RegisterConnection(Context.ConnectionId); }
        catch (BingoException error)
        {
            await Clients.Caller.SendAsync("Closed", error.Message);
            Context.Abort();
            return;
        }
        await base.OnConnectedAsync();
    }
    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        await store.DisconnectAsync(Context.ConnectionId);
        await base.OnDisconnectedAsync(exception);
    }
    public Task<PublicLobby> Inspect(string code) => store.InspectAsync(code);
    public Task<Session> Create(string name, int color) => store.CreateAsync(Context.ConnectionId, name, color);
    public Task<Session> Join(string code, string name, int color) => store.JoinAsync(Context.ConnectionId, code, name, color);
    public Task<Session> Recover(string code, string name, string? hostKey) => store.RecoverAsync(Context.ConnectionId, code, name, hostKey);
    public Task<Session> Resume(string code, string token) => store.ResumeAsync(Context.ConnectionId, code, token);
    public Task<Snapshot> GetState() => store.GetStateAsync(Context.ConnectionId);
    public Task SetColor(int color) => store.CommandAsync(Context.ConnectionId, (game, id) => game.SetColor(id, color));
    public Task SavePreparation(string[] words, int[] sips) => store.CommandAsync(Context.ConnectionId, (game, id) => game.SavePreparation(id, words, sips));
    public Task SetSettings(int budget, string mode) => store.CommandAsync(Context.ConnectionId, (game, id) => game.SetSettings(id, budget, mode));
    public Task Start() => store.CommandAsync(Context.ConnectionId, (game, id) => game.Start(id, clock.GetUtcNow()));
    public Task SetValidation(string cellId, bool validated) => store.SetValidationAsync(Context.ConnectionId, cellId, validated);
    public Task EndRound() => store.CommandAsync(Context.ConnectionId, (game, id) => game.EndRound(id));
    public Task Rematch() => store.CommandAsync(Context.ConnectionId, (game, id) => game.Rematch(id));
    public Task Kick(string playerId) => store.KickAsync(Context.ConnectionId, playerId);
    public Task Close() => store.CloseAsync(Context.ConnectionId);
}

public sealed class BingoHubFilter(TimeProvider clock) : IHubFilter
{
    public async ValueTask<object?> InvokeMethodAsync(HubInvocationContext context,
        Func<HubInvocationContext, ValueTask<object?>> next)
    {
        // Per-connection bound queue, complementing the maximum connection/lobby/payload limits.
        const string key = "bingo-invocations";
        if (!context.Context.Items.TryGetValue(key, out var value))
            context.Context.Items[key] = value = new Queue<DateTimeOffset>();
        var invocations = (Queue<DateTimeOffset>)value!;
        var now = clock.GetUtcNow();
        while (invocations.TryPeek(out var first) && first <= now.AddSeconds(-10)) invocations.Dequeue();
        if (invocations.Count >= 160) throw new HubException("Trop d’actions rapprochées. Patientez quelques secondes.");
        invocations.Enqueue(now);
        try { return await next(context); }
        catch (BingoException error) { throw new HubException(error.Message); }
    }
}
