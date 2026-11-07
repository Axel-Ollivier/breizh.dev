using System.Net;
using System.Net.Http.Json;
using System.Text;
using Krampouezh;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Krampouezh.Tests;

public sealed class LeaderboardTests
{
    [Fact]
    public async Task Empty_board_and_submission_are_shared_between_clients()
    {
        using var directory = new TemporaryDirectory();
        await using var factory = new LeaderboardFactory(directory.Database);
        using var one = factory.CreateClient();
        using var two = factory.CreateClient();
        var empty = await one.GetFromJsonAsync<Leaderboard>("/api/leaderboard");
        Assert.Empty(empty!.Entries);
        Assert.Equal(0, empty.Total);
        Assert.Null(empty.Rank);
        var id = Guid.NewGuid();
        var response = await one.PostAsJsonAsync("/api/leaderboard", new { id, name = "  Maël  ", score = 42 });
        response.EnsureSuccessStatusCode();
        var saved = await response.Content.ReadFromJsonAsync<Leaderboard>();
        Assert.Equal(1, saved!.Rank);
        Assert.Equal("Maël", Assert.Single(saved.Entries).Name);
        var shared = await two.GetFromJsonAsync<Leaderboard>($"/api/leaderboard?id={id}");
        Assert.Equal(saved.Entries, shared!.Entries);
        Assert.Equal(saved.Rank, shared.Rank);
        Assert.Null((await two.GetFromJsonAsync<Leaderboard>($"/api/leaderboard?id={Guid.NewGuid()}"))!.Rank);
        Assert.Equal("no-store", (await two.GetAsync("/api/leaderboard")).Headers.CacheControl!.ToString());
        Assert.Contains("Krampouezh", await two.GetStringAsync("/"));
    }

    [Theory]
    [InlineData("{\"name\":\"Anna\",\"score\":12}")]
    [InlineData("{\"id\":\"invalid\",\"name\":\"Anna\",\"score\":12}")]
    [InlineData("{\"id\":\"00000000-0000-0000-0000-000000000000\",\"name\":\"Anna\",\"score\":12}")]
    [InlineData("{\"id\":\"61de59a5-7ff2-428f-987e-9b67d14f0516\",\"score\":12}")]
    [InlineData("{\"id\":\"61de59a5-7ff2-428f-987e-9b67d14f0516\",\"name\":\"A\",\"score\":12}")]
    [InlineData("{\"id\":\"61de59a5-7ff2-428f-987e-9b67d14f0516\",\"name\":\"                     \",\"score\":12}")]
    [InlineData("{\"id\":\"61de59a5-7ff2-428f-987e-9b67d14f0516\",\"name\":\"abcdefghijklmnopqrstu\",\"score\":12}")]
    [InlineData("{\"id\":\"61de59a5-7ff2-428f-987e-9b67d14f0516\",\"name\":\"An\\nna\",\"score\":12}")]
    [InlineData("{\"id\":\"61de59a5-7ff2-428f-987e-9b67d14f0516\",\"name\":\"An\\u200Bna\",\"score\":12}")]
    [InlineData("{\"id\":\"61de59a5-7ff2-428f-987e-9b67d14f0516\",\"name\":\"Anna\",\"score\":0}")]
    [InlineData("{\"id\":\"61de59a5-7ff2-428f-987e-9b67d14f0516\",\"name\":\"Anna\",\"score\":-1}")]
    [InlineData("{\"id\":\"61de59a5-7ff2-428f-987e-9b67d14f0516\",\"name\":\"Anna\",\"score\":1000001}")]
    [InlineData("{\"id\":\"61de59a5-7ff2-428f-987e-9b67d14f0516\",\"name\":\"Anna\",\"score\":1.5}")]
    [InlineData("{\"id\":\"61de59a5-7ff2-428f-987e-9b67d14f0516\",\"name\":\"Anna\",\"score\":\"wrong\"}")]
    [InlineData("{\"id\":\"61de59a5-7ff2-428f-987e-9b67d14f0516\",\"name\":\"Anna\",\"score\":\"12\"}")]
    [InlineData("null")]
    [InlineData("{bad json")]
    public async Task Invalid_payloads_are_rejected_without_adding_a_score(string json)
    {
        using var directory = new TemporaryDirectory();
        await using var factory = new LeaderboardFactory(directory.Database);
        using var client = factory.CreateClient();
        var response = await client.PostAsync("/api/leaderboard", new StringContent(json, Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, (await client.GetFromJsonAsync<Leaderboard>("/api/leaderboard"))!.Total);
    }

    [Fact]
    public async Task Unicode_names_and_score_bounds_are_supported_and_conflicts_rejected()
    {
        using var directory = new TemporaryDirectory();
        await using var factory = new LeaderboardFactory(directory.Database);
        using var client = factory.CreateClient();
        var id = Guid.NewGuid();
        var name = string.Concat(Enumerable.Repeat("🥞", 20));
        var submission = new { id, name, score = 1_000_000 };
        (await client.PostAsJsonAsync("/api/leaderboard", submission)).EnsureSuccessStatusCode();
        var retry = await client.PostAsJsonAsync("/api/leaderboard", submission);
        Assert.Equal(1, (await retry.Content.ReadFromJsonAsync<Leaderboard>())!.Total);
        var conflict = await client.PostAsJsonAsync("/api/leaderboard", new { id, name, score = 1 });
        Assert.Equal(HttpStatusCode.Conflict, conflict.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/leaderboard?id=invalid")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync($"/api/leaderboard?id={Guid.Empty}")).StatusCode);
    }

    [Fact]
    public void Top_100_retains_all_runs_and_reports_rank_outside_the_visible_board_after_restart()
    {
        using var directory = new TemporaryDirectory();
        var store = new LeaderboardStore(directory.Database, new FrozenClock());
        var submissions = Enumerable.Range(1, 125).Select(score => new ScoreSubmission(Guid.NewGuid(), "Anna", score)).ToArray();
        foreach (var submission in submissions) store.Submit(submission);
        var low = store.Read(submissions[0].Id);
        Assert.Equal(125, low.Total);
        Assert.Equal(125, low.Rank);
        Assert.Equal(100, low.Entries.Length);
        Assert.Equal(Enumerable.Range(26, 100).Reverse(), low.Entries.Select(entry => entry.Score));
        Assert.DoesNotContain(low.Entries, entry => entry.Id == submissions[0].Id);
        var reloaded = new LeaderboardStore(directory.Database);
        var retry = reloaded.Submit(submissions[0]);
        Assert.Equal(low.Entries, retry.Entries);
        Assert.Equal(125, retry.Total);
        Assert.Equal(125, retry.Rank);
    }

    [Fact]
    public async Task Api_returns_the_submitted_rank_even_below_the_top_100()
    {
        using var directory = new TemporaryDirectory();
        await using var factory = new LeaderboardFactory(directory.Database);
        using var client = factory.CreateClient();
        var store = factory.Services.GetRequiredService<LeaderboardStore>();
        foreach (var score in Enumerable.Range(2, 110))
            store.Submit(new ScoreSubmission(Guid.NewGuid(), "Anna", score));
        var id = Guid.NewGuid();
        var response = await client.PostAsJsonAsync("/api/leaderboard", new { id, name = "Yann", score = 1 });
        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<Leaderboard>();
        Assert.Equal(111, result!.Total);
        Assert.Equal(111, result.Rank);
        Assert.Equal(100, result.Entries.Length);
        Assert.DoesNotContain(result.Entries, entry => entry.Id == id);
        Assert.Equal(111, (await client.GetFromJsonAsync<Leaderboard>($"/api/leaderboard?id={id}"))!.Rank);
    }

    [Fact]
    public void Equal_scores_keep_first_submitted_run_ahead_even_with_identical_timestamps()
    {
        using var directory = new TemporaryDirectory();
        var store = new LeaderboardStore(directory.Database, new FrozenClock());
        var first = new ScoreSubmission(Guid.NewGuid(), "Anna", 50);
        var second = new ScoreSubmission(Guid.NewGuid(), "Yann", 50);
        store.Submit(first);
        var result = store.Submit(second);
        Assert.Equal(new[] { first.Id, second.Id }, result.Entries.Select(entry => entry.Id));
        Assert.Equal(2, result.Rank);
        Assert.Equal(1, store.Submit(first with { Name = "  Anna  " }).Rank);
        Assert.Throws<ScoreConflictException>(() => store.Submit(first with { Name = "Yann" }));
    }

    [Fact]
    public async Task Concurrent_submissions_and_retries_are_not_lost_or_duplicated()
    {
        using var directory = new TemporaryDirectory();
        var store = new LeaderboardStore(directory.Database);
        var submissions = Enumerable.Range(1, 150).Select(score => new ScoreSubmission(Guid.NewGuid(), "Anna", score)).ToArray();
        await Task.WhenAll(submissions.SelectMany(submission => new[] { submission, submission }).Select(submission => Task.Run(() => store.Submit(submission))));
        var result = new LeaderboardStore(directory.Database).Read(submissions[0].Id);
        Assert.Equal(150, result.Total);
        Assert.Equal(150, result.Rank);
        Assert.Equal(Enumerable.Range(51, 100).Reverse(), result.Entries.Select(entry => entry.Score));
    }

    [Fact]
    public void Corrupt_existing_storage_is_not_replaced()
    {
        using var directory = new TemporaryDirectory();
        File.WriteAllText(directory.Database, "not a sqlite database");
        Assert.Throws<SqliteException>(() => new LeaderboardStore(directory.Database));
        Assert.Equal("not a sqlite database", File.ReadAllText(directory.Database));
    }

    [Fact]
    public async Task Storage_failure_returns_a_generic_error()
    {
        using var directory = new TemporaryDirectory();
        await using var factory = new LeaderboardFactory(directory.Database);
        using var client = factory.CreateClient();
        File.WriteAllText(directory.Database, "broken storage");
        var read = await client.GetAsync("/api/leaderboard");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, read.StatusCode);
        Assert.Equal("{\"error\":\"Classement indisponible pour le moment.\"}", await read.Content.ReadAsStringAsync());
        var write = await client.PostAsJsonAsync("/api/leaderboard", new { id = Guid.NewGuid(), name = "Anna", score = 1 });
        Assert.Equal(HttpStatusCode.ServiceUnavailable, write.StatusCode);
        Assert.DoesNotContain(directory.Database, await write.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Rate_limit_is_global_and_does_not_affect_reads()
    {
        using var directory = new TemporaryDirectory();
        await using var factory = new LeaderboardFactory(directory.Database);
        using var client = factory.CreateClient();
        for (var i = 0; i < 30; i++)
            (await client.PostAsJsonAsync("/api/leaderboard", new { id = Guid.NewGuid(), name = "Anna", score = 1 })).EnsureSuccessStatusCode();
        using var other = factory.CreateClient();
        other.DefaultRequestHeaders.Add("X-Forwarded-For", "203.0.113.1");
        var limited = await other.PostAsJsonAsync("/api/leaderboard", new { id = Guid.NewGuid(), name = "Anna", score = 1 });
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
        Assert.NotNull(limited.Headers.RetryAfter);
        Assert.Equal(30, (await client.GetFromJsonAsync<Leaderboard>("/api/leaderboard"))!.Total);
    }

    private sealed class FrozenClock : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
    }

    private sealed class LeaderboardFactory(string database) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseContentRoot(Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../server")));
            builder.UseSetting("Leaderboard:DataPath", database);
        }
    }

    private sealed class TemporaryDirectory : IDisposable
    {
        private readonly string path = Path.Combine(Path.GetTempPath(), "krampouezh-tests-" + Guid.NewGuid());
        public string Database => Path.Combine(path, "leaderboard.db");
        public TemporaryDirectory() => Directory.CreateDirectory(path);
        public void Dispose() => Directory.Delete(path, recursive: true);
    }
}
