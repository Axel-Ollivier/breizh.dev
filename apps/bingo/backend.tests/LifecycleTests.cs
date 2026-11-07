using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

namespace Bingo.Tests;

public sealed class LifecycleTests
{
    [Fact]
    public async Task Backend_cleanup_removes_a_lobby_after_the_last_player_disconnects_and_the_grace_elapses()
    {
        var clock = new ControlledClock();
        await using var factory = Factory(clock);
        var first = await SignalRTests.Client.Connect(factory);
        var session = await first.Result("Create", "Host", 0);
        var second = await SignalRTests.Client.Connect(factory);
        await second.Result("Join", session.GetProperty("code").GetString(), "Guest", 1);
        var store = factory.Services.GetRequiredService<LobbyStore>();
        await first.DisposeAsync();
        await second.DisposeAsync();
        Assert.Equal(1, store.Count);
        clock.Advance(TimeSpan.FromSeconds(59));
        await store.CleanupAsync();
        Assert.Equal(1, store.Count);
        clock.Advance(TimeSpan.FromSeconds(1));
        // No client is running and no request invokes cleanup: the hosted backend worker does it.
        await SignalRTests.Eventually(() => Task.FromResult(store.Count == 0));
        await using var lateReturn = await SignalRTests.Client.Connect(factory);
        await Assert.ThrowsAsync<HubException>(() => lateReturn.Result("Resume", session.GetProperty("code").GetString(), session.GetProperty("token").GetString()));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Backend_worker_enforces_the_six_hour_deadline_and_notifies_connected_clients(bool manuallyFinished)
    {
        var clock = new ControlledClock();
        await using var factory = Factory(clock);
        var clients = new List<SignalRTests.Client>();
        try
        {
            string? code = null;
            for (var i = 0; i < 4; i++)
            {
                var client = await SignalRTests.Client.Connect(factory);
                clients.Add(client);
                var session = i == 0 ? await client.Result("Create", "Player 0", 0) : await client.Result("Join", code, $"Player {i}", i);
                code ??= session.GetProperty("code").GetString();
            }
            foreach (var client in clients) await client.Call("SavePreparation", new[] { "one", "two", "three", "four" }, new[] { 0, 0, 0, 0 });
            await clients[0].Call("Start");
            var expiry = (await clients[0].State()).GetProperty("expiresAt").GetDateTimeOffset();
            Assert.Equal(clock.GetUtcNow().AddHours(6), expiry);
            if (manuallyFinished) await clients[0].Call("EndRound");
            clock.Advance(TimeSpan.FromHours(6).Subtract(TimeSpan.FromSeconds(1)));
            await factory.Services.GetRequiredService<LobbyStore>().CleanupAsync();
            Assert.Equal(1, factory.Services.GetRequiredService<LobbyStore>().Count);
            Assert.Equal(expiry, (await clients[1].State()).GetProperty("expiresAt").GetDateTimeOffset());
            clock.Advance(TimeSpan.FromSeconds(1));
            await SignalRTests.Eventually(() => Task.FromResult(clients.All(c => c.Closures.Count == 1)));
            Assert.Equal(0, factory.Services.GetRequiredService<LobbyStore>().Count);
            Assert.All(clients, client => Assert.Contains("6 heures", client.Closures.Single()));
            await Assert.ThrowsAsync<HubException>(() => clients[0].Call("SetValidation", "any-cell", true));
        }
        finally { foreach (var client in clients) await client.DisposeAsync(); }
    }

    [Fact]
    public async Task Lobby_capacity_is_bounded_and_freed_on_close()
    {
        await using var factory = Factory(new ControlledClock(), 1);
        await using var first = await SignalRTests.Client.Connect(factory);
        await using var second = await SignalRTests.Client.Connect(factory);
        await first.Result("Create", "First host", 0);
        await Assert.ThrowsAsync<HubException>(() => second.Result("Create", "Second host", 1));
        Assert.Equal(1, factory.Services.GetRequiredService<LobbyStore>().Count);
        await first.Call("Close");
        await second.Result("Create", "Second host", 1);
        Assert.Equal(1, factory.Services.GetRequiredService<LobbyStore>().Count);
    }

    private static WebApplicationFactory<Program> Factory(TimeProvider clock, int maxLobbies = 500) =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<TimeProvider>();
            services.AddSingleton(clock);
            services.Configure<BingoOptions>(options => options.MaxLobbies = maxLobbies);
        }));

    private sealed class ControlledClock : TimeProvider
    {
        private long ticks = new DateTimeOffset(2026, 11, 7, 12, 0, 0, TimeSpan.Zero).Ticks;
        public override DateTimeOffset GetUtcNow() => new(Interlocked.Read(ref ticks), TimeSpan.Zero);
        public void Advance(TimeSpan duration) => Interlocked.Add(ref ticks, duration.Ticks);
    }
}
