using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;
using Xunit;

namespace Bingo.Tests;

/// <summary>Exercises the actual hub with independent SignalR clients and server JSON projections.</summary>
public sealed class SignalRTests
{
    [Fact]
    public async Task Four_clients_share_a_round_without_receiving_other_players_secrets()
    {
        await using var game = await ConnectedGame.Create();
        var host = game.Clients[0];
        var waiting = await host.State();
        Assert.Empty(waiting.GetProperty("cells").EnumerateArray());
        Assert.DoesNotContain("secret-player-1", waiting.GetRawText());
        Assert.DoesNotContain(game.Sessions[1].GetProperty("token").GetString()!, waiting.GetRawText());
        Assert.DoesNotContain(game.Sessions[0].GetProperty("hostKey").GetString()!, waiting.GetRawText());
        Assert.True(waiting.GetProperty("canStart").GetBoolean());

        await host.Call("Start");
        foreach (var client in game.Clients)
        {
            var state = await client.State();
            Assert.Equal(16, state.GetProperty("cells").GetArrayLength());
            Assert.Equal(16, state.GetProperty("cells").EnumerateArray().Select(c => c.GetProperty("id").GetString()).Distinct().Count());
            foreach (var cell in state.GetProperty("cells").EnumerateArray())
            {
                Assert.Contains("secret-player-", cell.GetProperty("word").GetString());
                Assert.Equal(cell.GetProperty("ownerId").GetString() == state.GetProperty("selfId").GetString(),
                    cell.GetProperty("sips").ValueKind == JsonValueKind.Number);
            }
        }

        var guestState = await game.Clients[1].State();
        var guestId = guestState.GetProperty("selfId").GetString();
        var chosen = guestState.GetProperty("cells").EnumerateArray().First(c => c.GetProperty("ownerId").GetString() == guestId && c.GetProperty("sips").GetInt32() > 0);
        var cellId = chosen.GetProperty("id").GetString()!;
        await Assert.ThrowsAsync<HubException>(() => game.Clients[1].Call("SetValidation", cellId, true));
        await Assert.ThrowsAsync<HubException>(() => game.Clients[1].Call("EndRound"));
        await Assert.ThrowsAsync<HubException>(() => game.Clients[1].Call("Close"));
        await host.Call("SetValidation", cellId, true);
        foreach (var client in game.Clients)
        {
            var state = await client.State();
            var visible = state.GetProperty("cells").EnumerateArray().Single(c => c.GetProperty("id").GetString() == cellId);
            Assert.True(visible.GetProperty("validated").GetBoolean());
            Assert.Equal(chosen.GetProperty("sips").GetInt32(), visible.GetProperty("sips").GetInt32());
            Assert.Equal(chosen.GetProperty("sips").GetInt32(), state.GetProperty("players").EnumerateArray().Single(p => p.GetProperty("id").GetString() == guestId).GetProperty("score").GetInt32());
        }

        await using var outsider = await Client.Connect(game.Factory);
        var info = await outsider.Result("Inspect", game.Code);
        Assert.False(info.TryGetProperty("cells", out _));
        Assert.False(info.TryGetProperty("ownPreparation", out _));
        Assert.All(info.GetProperty("players").EnumerateArray(), player => Assert.Equal(0, player.GetProperty("score").GetInt32()));
        await Assert.ThrowsAsync<HubException>(() => outsider.Result("Join", game.Code, "Late player", 5));
        await Assert.ThrowsAsync<HubException>(() => outsider.State());

        await host.Call("SetValidation", cellId, false);
        var afterUndo = await host.State();
        Assert.Equal(JsonValueKind.Null, afterUndo.GetProperty("cells").EnumerateArray().Single(c => c.GetProperty("id").GetString() == cellId).GetProperty("sips").ValueKind);
        Assert.All(afterUndo.GetProperty("players").EnumerateArray(), p => Assert.Equal(0, p.GetProperty("score").GetInt32()));
        await host.Call("EndRound");
        Assert.Equal("finished", (await game.Clients[2].State()).GetProperty("phase").GetString());
        await host.Call("Rematch");
        var rematch = await game.Clients[3].State();
        Assert.Equal("lobby", rematch.GetProperty("phase").GetString());
        Assert.Equal(game.Code, rematch.GetProperty("code").GetString());
        Assert.Equal(4, rematch.GetProperty("players").GetArrayLength());
        Assert.Empty(rematch.GetProperty("cells").EnumerateArray());
        Assert.All(rematch.GetProperty("players").EnumerateArray(), p => Assert.Equal(JsonValueKind.Null, p.GetProperty("color").ValueKind));
    }

    [Theory]
    [InlineData("same-name")]
    [InlineData("same-color")]
    public async Task Concurrent_join_conflicts_are_resolved_on_the_server(string conflict)
    {
        await using var factory = new WebApplicationFactory<Program>();
        await using var host = await Client.Connect(factory);
        var session = await host.Result("Create", "Host", 0);
        var code = session.GetProperty("code").GetString()!;
        await using var one = await Client.Connect(factory);
        await using var two = await Client.Connect(factory);
        var joins = new[]
        {
            TryJoin(one, code, "Alice", 1),
            TryJoin(two, code, conflict == "same-name" ? "  ALICE  " : "Bob", conflict == "same-color" ? 1 : 2)
        };
        var results = await Task.WhenAll(joins);
        Assert.Single(results, result => result);
        var state = await host.State();
        Assert.Equal(2, state.GetProperty("players").GetArrayLength());
    }

    [Fact]
    public async Task Recovery_rotates_sessions_and_requires_a_separate_host_key()
    {
        await using var game = await ConnectedGame.Create();
        await game.Clients[0].Call("Start");
        var guestSession = game.Sessions[1];
        await using var recovering = await Client.Connect(game.Factory);
        await Assert.ThrowsAsync<HubException>(() => recovering.Result("Recover", game.Code, "Player 1", null));
        await game.Clients[1].DisposeAsync();
        await Eventually(async () => !(await game.Clients[0].State()).GetProperty("players").EnumerateArray().Single(p => p.GetProperty("name").GetString() == "Player 1").GetProperty("connected").GetBoolean());
        var recovered = await recovering.Result("Recover", game.Code, "Player 1", null);
        Assert.Equal(guestSession.GetProperty("playerId").GetString(), recovered.GetProperty("playerId").GetString());
        Assert.NotEqual(guestSession.GetProperty("token").GetString(), recovered.GetProperty("token").GetString());
        await using var stale = await Client.Connect(game.Factory);
        await Assert.ThrowsAsync<HubException>(() => stale.Result("Resume", game.Code, guestSession.GetProperty("token").GetString()));
        await using var extraTab = await Client.Connect(game.Factory);
        var resumed = await extraTab.Result("Resume", game.Code, recovered.GetProperty("token").GetString());
        Assert.Equal(recovered.GetProperty("playerId").GetString(), resumed.GetProperty("playerId").GetString());
        await extraTab.DisposeAsync();
        Assert.True((await game.Clients[0].State()).GetProperty("players").EnumerateArray().Single(p => p.GetProperty("name").GetString() == "Player 1").GetProperty("connected").GetBoolean());
        await Assert.ThrowsAsync<HubException>(() => stale.Result("Recover", game.Code, "Player 1", null));

        var hostKey = game.Sessions[0].GetProperty("hostKey").GetString()!;
        await game.Clients[0].DisposeAsync();
        await Eventually(async () => !(await recovering.State()).GetProperty("hostConnected").GetBoolean());
        await Assert.ThrowsAsync<HubException>(() => stale.Result("Recover", game.Code, "Player 0", null));
        await Assert.ThrowsAsync<HubException>(() => stale.Result("Recover", game.Code, "Player 0", "wrong-key"));
        var recoveredHost = await stale.Result("Recover", game.Code, "Player 0", hostKey);
        Assert.Equal(game.Sessions[0].GetProperty("playerId").GetString(), recoveredHost.GetProperty("playerId").GetString());
        var cellId = (await stale.State()).GetProperty("cells")[0].GetProperty("id").GetString()!;
        await stale.Call("SetValidation", cellId, true);
        Assert.True((await recovering.State()).GetProperty("cells")[0].GetProperty("validated").GetBoolean());
    }

    [Fact]
    public async Task Combination_notifications_reach_every_client_once_and_do_not_replay_on_resume()
    {
        await using var game = await ConnectedGame.Create();
        var host = game.Clients[0];
        await host.Call("Start");
        var row = (await host.State()).GetProperty("cells").EnumerateArray().Take(4).Select(c => c.GetProperty("id").GetString()!).ToArray();
        foreach (var id in row)
            await host.Call("SetValidation", id, true);
        await Eventually(() => Task.FromResult(game.Clients.All(c => c.Bonuses.Count == 1)));
        foreach (var client in game.Clients)
        {
            Assert.Single(client.Bonuses.Single().GetProperty("combinations").EnumerateArray());
            Assert.Single((await client.State()).GetProperty("combinations").EnumerateArray());
        }
        await host.Call("SetValidation", row[3], true);
        await using var reconnect = await Client.Connect(game.Factory);
        await reconnect.Result("Resume", game.Code, game.Sessions[1].GetProperty("token").GetString());
        Assert.Single((await reconnect.State()).GetProperty("combinations").EnumerateArray());
        Assert.Empty(reconnect.Bonuses);
        Assert.All(game.Clients, client => Assert.Single(client.Bonuses));
        await host.Call("SetValidation", row[3], false);
        Assert.Empty((await reconnect.State()).GetProperty("combinations").EnumerateArray());
        await host.Call("SetValidation", row[3], true);
        await Eventually(() => Task.FromResult(game.Clients.All(c => c.Bonuses.Count == 2) && reconnect.Bonuses.Count == 1));
        Assert.Single((await reconnect.State()).GetProperty("combinations").EnumerateArray());
    }

    [Fact]
    public async Task Closing_the_lobby_notifies_all_clients_and_removes_it()
    {
        await using var game = await ConnectedGame.Create();
        await game.Clients[0].Call("Close");
        await Eventually(() => Task.FromResult(game.Clients.All(c => c.Closures.Count == 1)));
        await using var outsider = await Client.Connect(game.Factory);
        await Assert.ThrowsAsync<HubException>(() => outsider.Result("Inspect", game.Code));
    }

    private static async Task<bool> TryJoin(Client client, string code, string name, int color)
    {
        try { await client.Result("Join", code, name, color); return true; }
        catch (HubException) { return false; }
    }

    internal static async Task Eventually(Func<Task<bool>> predicate)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        while (!await predicate()) await Task.Delay(20, timeout.Token);
    }

    internal sealed class Client(HubConnection connection) : IAsyncDisposable
    {
        private bool disposed;
        public ConcurrentQueue<JsonElement> States { get; } = new();
        public ConcurrentQueue<JsonElement> Bonuses { get; } = new();
        public ConcurrentQueue<string> Closures { get; } = new();

        public static async Task<Client> Connect(WebApplicationFactory<Program> factory)
        {
            var connection = new HubConnectionBuilder().WithUrl("http://localhost/bingo/hub", options =>
            {
                options.Transports = HttpTransportType.LongPolling;
                options.HttpMessageHandlerFactory = _ => factory.Server.CreateHandler();
            }).Build();
            var client = new Client(connection);
            connection.On<JsonElement>("State", value => client.States.Enqueue(value.Clone()));
            connection.On<JsonElement>("CombinationsActivated", value => client.Bonuses.Enqueue(value.Clone()));
            connection.On<string>("Closed", reason => client.Closures.Enqueue(reason));
            await connection.StartAsync();
            return client;
        }

        public Task<JsonElement> State() => Result("GetState");
        public Task<JsonElement> Result(string method, params object?[] args) => connection.InvokeCoreAsync<JsonElement>(method, args);
        public Task Call(string method, params object?[] args) => connection.InvokeCoreAsync(method, args);
        public async ValueTask DisposeAsync()
        {
            if (disposed) return;
            disposed = true;
            await connection.DisposeAsync();
        }
    }

    internal sealed class ConnectedGame : IAsyncDisposable
    {
        public WebApplicationFactory<Program> Factory { get; } = new();
        public List<Client> Clients { get; } = [];
        public List<JsonElement> Sessions { get; } = [];
        public string Code => Sessions[0].GetProperty("code").GetString()!;

        public static async Task<ConnectedGame> Create()
        {
            var game = new ConnectedGame();
            try
            {
                for (var i = 0; i < 4; i++)
                {
                    var client = await Client.Connect(game.Factory);
                    game.Clients.Add(client);
                    game.Sessions.Add(i == 0 ? await client.Result("Create", "Player 0", 0) : await client.Result("Join", game.Code, $"Player {i}", i));
                }
                await game.Clients[0].Call("SetSettings", 20, "manual");
                for (var i = 0; i < 4; i++)
                    await game.Clients[i].Call("SavePreparation", Enumerable.Repeat($"secret-player-{i}", 4).ToArray(), new[] { 0, 2, 3, 4 });
                return game;
            }
            catch { await game.DisposeAsync(); throw; }
        }

        public async ValueTask DisposeAsync()
        {
            foreach (var client in Clients) await client.DisposeAsync();
            await Factory.DisposeAsync();
        }
    }
}
