using Xunit;

namespace Bingo.Tests;

public sealed class GameTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 7, 12, 0, 0, TimeSpan.Zero);

    [Theory]
    [InlineData(4)]
    [InlineData(5)]
    [InlineData(6)]
    [InlineData(7)]
    [InlineData(8)]
    [InlineData(9)]
    [InlineData(10)]
    public void A_round_has_N_squared_cells_and_N_cells_per_player(int size)
    {
        var game = Prepared(size);
        game.Start(game.HostId, Now);
        Assert.Equal(size * size, game.Cells.Count);
        Assert.Equal(size * size, game.Cells.Select(c => c.Id).Distinct().Count());
        Assert.All(game.Players, p => Assert.Equal(size, game.Cells.Count(c => c.OwnerId == p.Id)));
        // All words are deliberately identical: text is never an identity or uniqueness constraint.
        Assert.All(game.Cells, c => Assert.Equal("same word", c.Word));
    }

    [Fact]
    public void Free_shuffling_allows_multiple_cells_of_one_player_in_a_row_or_column()
    {
        var foundUnbalancedRow = false;
        var foundUnbalancedColumn = false;
        for (var seed = 0; seed < 20; seed++)
        {
            var game = Prepared(4, seed: seed);
            game.Start(game.HostId, Now);
            foundUnbalancedRow |= Enumerable.Range(0, 4).Any(row => game.Cells.Skip(row * 4).Take(4).Select(c => c.OwnerId).Distinct().Count() < 4);
            foundUnbalancedColumn |= Enumerable.Range(0, 4).Any(col => Enumerable.Range(0, 4).Select(row => game.Cells[row * 4 + col].OwnerId).Distinct().Count() < 4);
        }
        Assert.True(foundUnbalancedRow);
        Assert.True(foundUnbalancedColumn);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(17)]
    [InlineData(100)]
    public void Random_mode_assigns_exact_budget_per_player_and_does_not_redraw_on_snapshot(int budget)
    {
        var game = Prepared(4, budget, "random");
        game.Start(game.HostId, Now);
        var initial = game.Cells.Select(c => (c.Id, c.Sips)).ToArray();
        Assert.All(game.Players, p => Assert.Equal(budget, game.Cells.Where(c => c.OwnerId == p.Id).Sum(c => c.Sips)));
        Assert.All(game.Cells, c => Assert.InRange(c.Sips, 0, budget));
        foreach (var p in game.Players) _ = game.Snapshot(p.Id);
        Assert.Equal(initial, game.Cells.Select(c => (c.Id, c.Sips)).ToArray());
        if (budget == 0) Assert.All(game.Cells, c => Assert.Equal(0, c.Sips));
    }

    [Fact]
    public void Random_distribution_is_not_forced_to_balance_the_cells()
    {
        var sawZero = false;
        var sawWholeBudgetOnOneCell = false;
        for (var seed = 0; seed < 100; seed++)
        {
            var game = Prepared(4, 2, "random", seed);
            game.Start(game.HostId, Now);
            sawZero |= game.Cells.Any(c => c.Sips == 0);
            sawWholeBudgetOnOneCell |= game.Cells.Any(c => c.Sips == 2);
        }
        Assert.True(sawZero);
        Assert.True(sawWholeBudgetOnOneCell);
    }

    [Theory]
    [InlineData(0, 0)]
    [InlineData(20, 0)]
    [InlineData(20, 3)]
    [InlineData(20, 5)]
    public void Manual_budget_can_be_unused_partially_used_or_fully_used(int budget, int perCell)
    {
        var game = Prepared(4, budget);
        foreach (var p in game.Players) game.SavePreparation(p.Id, Words(4), Enumerable.Repeat(perCell, 4).ToArray());
        game.Start(game.HostId, Now);
        Assert.All(game.Players, p => Assert.Equal(perCell * 4, game.Cells.Where(c => c.OwnerId == p.Id).Sum(c => c.Sips)));
    }

    [Fact]
    public void Invalid_preparation_never_allows_start_and_budget_limits_are_enforced()
    {
        var game = Prepared(4, 5);
        Assert.Throws<BingoException>(() => game.SetSettings(game.HostId, -1, "manual"));
        Assert.Throws<BingoException>(() => game.SetSettings(game.HostId, 101, "manual"));
        Assert.Throws<BingoException>(() => game.SetSettings(game.HostId, 5, "invalid"));
        Assert.Throws<BingoException>(() => game.SavePreparation(game.HostId, Words(4), [-1, 0, 0, 0]));
        Assert.Throws<BingoException>(() => game.SavePreparation(game.HostId, Words(4), [2, 2, 2, 0]));
        Assert.Throws<BingoException>(() => game.SavePreparation(game.HostId, [new string('x', 61), "word", "word", "word"], [0, 0, 0, 0]));
        game.SavePreparation(game.HostId, ["word", "   ", "word", "word"], [0, 0, 0, 0]);
        Assert.Throws<BingoException>(() => game.Start(game.HostId, Now));
        game.SavePreparation(game.HostId, Words(4), [0, 0, 0, 0]);
        game.SetSettings(game.HostId, 20, "manual");
        game.SavePreparation(game.HostId, Words(4), [5, 5, 5, 5]);
        game.SetSettings(game.HostId, 5, "manual");
        Assert.Throws<BingoException>(() => game.Start(game.HostId, Now));
    }

    [Theory]
    [InlineData(4)]
    [InlineData(5)]
    [InlineData(6)]
    [InlineData(7)]
    [InlineData(8)]
    [InlineData(9)]
    [InlineData(10)]
    public void Every_supported_size_preserves_the_exact_random_budget(int size)
    {
        var game = Prepared(size, 37, "random");
        game.Start(game.HostId, Now);
        Assert.Equal(size * size, game.Cells.Count);
        Assert.All(game.Players, player =>
        {
            var ownCells = game.Cells.Where(cell => cell.OwnerId == player.Id).ToArray();
            Assert.Equal(size, ownCells.Length);
            Assert.Equal(37, ownCells.Sum(cell => cell.Sips));
        });
    }

    [Fact]
    public void Lobby_size_changes_preserve_existing_words_and_require_preparation_to_match_new_size()
    {
        var game = Prepared(4);
        var words = game.Snapshot(game.HostId).OwnPreparation.Words.ToArray();
        var joined = game.Join("Late friend", 4);
        Assert.Equal(words, game.Snapshot(game.HostId).OwnPreparation.Words.Take(4));
        Assert.False(game.Snapshot(game.HostId).CanStart);
        Assert.Throws<BingoException>(() => game.Start(game.HostId, Now));
        game.Kick(game.HostId, joined.Id);
        Assert.True(game.Snapshot(game.HostId).CanStart);
        Assert.Equal(words, game.Snapshot(game.HostId).OwnPreparation.Words);
    }

    [Fact]
    public void Lobby_player_and_identity_limits_are_enforced()
    {
        var small = Prepared(3);
        Assert.Throws<BingoException>(() => small.Start(small.HostId, Now));
        var full = Prepared(10);
        Assert.Throws<BingoException>(() => full.Join("Eleventh player", 0));
        Assert.Throws<BingoException>(() => small.Join("Player 0", 4));
        Assert.Throws<BingoException>(() => small.Join("New player", 0));
        Assert.Throws<BingoException>(() => small.Join("New player", 10));
        Assert.Throws<BingoException>(() => small.Join(" ", 3));
        Assert.Throws<BingoException>(() => small.Join(new string('n', 25), 3));
    }

    [Fact]
    public void Shrinking_then_growing_the_lobby_does_not_discard_surplus_draft_words()
    {
        var game = Prepared(5);
        game.SavePreparation(game.HostId, ["one", "two", "three", "four", "keep fifth"], [0, 0, 0, 0, 7]);
        game.Kick(game.HostId, game.Players[4].Id);
        game.SavePreparation(game.HostId, ["changed", "two", "three", "four"], [1, 0, 0, 0]);
        game.Join("Replacement", 4);
        var preparation = game.Snapshot(game.HostId).OwnPreparation;
        Assert.Equal(new[] { "changed", "two", "three", "four", "keep fifth" }, preparation.Words);
        Assert.Equal(new[] { 1, 0, 0, 0, 7 }, preparation.Sips);
    }

    [Fact]
    public void Disconnected_ordinary_players_keep_their_cells_and_scores()
    {
        var game = Prepared(4);
        var guest = game.Players[1];
        game.SavePreparation(guest.Id, Words(4), [1, 2, 3, 4]);
        game.Start(game.HostId, Now);
        game.Disconnect(guest.Id, guest.Id, Now.AddMinutes(1));
        foreach (var cell in game.Cells.Where(c => c.OwnerId == guest.Id))
            game.SetValidation(game.HostId, cell.Id, true);
        var player = game.Snapshot(game.HostId).Players.Single(p => p.Id == guest.Id);
        Assert.False(player.Connected);
        Assert.Equal(10, player.Score);
        Assert.Equal(4, game.Cells.Count(c => c.OwnerId == guest.Id));
    }

    [Fact]
    public void Only_host_can_manage_round_settings_players_and_validations()
    {
        var game = Prepared(4);
        var guest = game.Players[1];
        Assert.Throws<BingoException>(() => game.SetSettings(guest.Id, 5, "random"));
        Assert.Throws<BingoException>(() => game.Start(guest.Id, Now));
        Assert.Throws<BingoException>(() => game.Kick(guest.Id, game.Players[2].Id));
        Assert.Throws<BingoException>(() => game.Kick(game.HostId, game.HostId));
        game.Start(game.HostId, Now);
        Assert.Throws<BingoException>(() => game.SetValidation(guest.Id, game.Cells[0].Id, true));
        Assert.Throws<BingoException>(() => game.EndRound(guest.Id));
        Assert.Throws<BingoException>(() => game.Rematch(guest.Id));
        Assert.Throws<BingoException>(() => game.Join("Too late", 4));
        Assert.Throws<BingoException>(() => game.Kick(game.HostId, guest.Id));
        Assert.Throws<BingoException>(() => game.SetColor(guest.Id, 5));
    }

    [Fact]
    public void Personal_snapshots_hide_words_before_start_and_other_owners_sips_until_validation()
    {
        var game = Prepared(4);
        for (var i = 0; i < 4; i++) game.SavePreparation(game.Players[i].Id, Enumerable.Repeat($"private-{i}", 4).ToArray(), [1, 2, 3, 4]);
        foreach (var viewer in game.Players)
        {
            var before = game.Snapshot(viewer.Id);
            Assert.Empty(before.Cells);
            Assert.All(before.OwnPreparation.Words, word => Assert.Equal($"private-{game.Players.IndexOf(viewer)}", word));
        }
        game.Start(game.HostId, Now);
        foreach (var viewer in game.Players)
        {
            var state = game.Snapshot(viewer.Id);
            Assert.All(state.Cells, cell => Assert.Equal(cell.OwnerId == viewer.Id, cell.Sips.HasValue));
        }
        var chosen = game.Cells.First(c => c.OwnerId != game.HostId);
        game.SetValidation(game.HostId, chosen.Id, true);
        Assert.All(game.Players, p => Assert.Equal(chosen.Sips, game.Snapshot(p.Id).Cells.Single(c => c.Id == chosen.Id).Sips));
        game.SetValidation(game.HostId, chosen.Id, false);
        Assert.Null(game.Snapshot(game.HostId).Cells.Single(c => c.Id == chosen.Id).Sips);
    }

    [Fact]
    public void Automatic_end_reopens_on_correction_but_manual_end_stays_finished()
    {
        var game = Prepared(4);
        game.Start(game.HostId, Now);
        foreach (var cell in game.Cells) game.SetValidation(game.HostId, cell.Id, true);
        Assert.Equal("finished", game.Snapshot(game.HostId).Phase);
        Assert.Equal("automatic", game.Snapshot(game.HostId).EndReason);
        game.SetValidation(game.HostId, game.Cells[0].Id, false);
        Assert.Equal("playing", game.Snapshot(game.HostId).Phase);
        Assert.Null(game.Snapshot(game.HostId).EndReason);
        game.EndRound(game.HostId);
        game.SetValidation(game.HostId, game.Cells[1].Id, false);
        Assert.Equal("finished", game.Snapshot(game.HostId).Phase);
        Assert.Equal("manual", game.Snapshot(game.HostId).EndReason);
    }

    [Fact]
    public void Rematch_keeps_identity_and_settings_but_resets_all_preparation_and_round_data()
    {
        var game = Prepared(4, 17, "random");
        var oldPlayers = game.Players.Select(p => (p.Id, p.Name, p.Token)).ToArray();
        game.Start(game.HostId, Now);
        var oldCells = game.Cells.Select(c => c.Id).ToHashSet();
        foreach (var cell in game.Cells) game.SetValidation(game.HostId, cell.Id, true);
        game.Rematch(game.HostId);
        var state = game.Snapshot(game.HostId);
        Assert.Equal("ABC123", state.Code);
        Assert.Equal("lobby", state.Phase);
        Assert.Equal(17, state.Budget);
        Assert.Equal("random", state.Mode);
        Assert.Equal(oldPlayers, game.Players.Select(p => (p.Id, p.Name, p.Token)).ToArray());
        Assert.Empty(state.Cells);
        Assert.Empty(state.Combinations);
        Assert.Null(state.StartedAt);
        Assert.Null(state.ExpiresAt);
        Assert.False(state.CanStart);
        Assert.All(state.Players, p => { Assert.Null(p.Color); Assert.Equal(0, p.Score); Assert.False(p.Ready); Assert.Equal(0, p.WordCount); });
        Assert.All(game.Players, p =>
        {
            Assert.All(game.Snapshot(p.Id).OwnPreparation.Words, word => Assert.True(string.IsNullOrWhiteSpace(word)));
            Assert.All(game.Snapshot(p.Id).OwnPreparation.Sips, sip => Assert.Equal(0, sip));
        });
        for (var i = 0; i < game.Players.Count; i++)
        {
            game.SetColor(game.Players[i].Id, i);
            game.SavePreparation(game.Players[i].Id, Words(4), [0, 0, 0, 0]);
        }
        game.Start(game.HostId, Now.AddMinutes(1));
        Assert.DoesNotContain(game.Cells, c => oldCells.Contains(c.Id));
    }

    [Fact]
    public void Grace_period_and_six_hour_lifetime_do_not_reset_on_reconnection()
    {
        var game = Prepared(4);
        foreach (var p in game.Players) game.Disconnect(p.Id, p.Id, Now);
        Assert.Null(game.ExpirationReason(Now.AddSeconds(59), TimeSpan.FromSeconds(60)));
        Assert.NotNull(game.ExpirationReason(Now.AddSeconds(60), TimeSpan.FromSeconds(60)));
        game.Connect(game.HostId, "return", Now.AddSeconds(59));
        Assert.Null(game.ExpirationReason(Now.AddMinutes(2), TimeSpan.FromSeconds(60)));
        game.Start(game.HostId, Now);
        var expiresAt = game.Snapshot(game.HostId).ExpiresAt;
        game.Disconnect(game.HostId, "return", Now.AddHours(5));
        game.Connect(game.HostId, "return-again", Now.AddHours(5).AddSeconds(10));
        Assert.Equal(expiresAt, game.Snapshot(game.HostId).ExpiresAt);
        Assert.Null(game.ExpirationReason(Now.AddHours(6).AddTicks(-1), TimeSpan.FromSeconds(60)));
        Assert.NotNull(game.ExpirationReason(Now.AddHours(6), TimeSpan.FromSeconds(60)));
    }

    internal static BingoGame Prepared(int size, int budget = 20, string mode = "manual", int seed = 17)
    {
        var game = new BingoGame("ABC123", "Player 0", 0, Now, new Random(seed));
        for (var i = 1; i < size; i++) game.Join($"Player {i}", i);
        foreach (var p in game.Players) game.Connect(p.Id, p.Id, Now);
        game.SetSettings(game.HostId, budget, mode);
        foreach (var p in game.Players) game.SavePreparation(p.Id, Words(size), new int[size]);
        return game;
    }

    private static string[] Words(int size) => Enumerable.Repeat("same word", size).ToArray();
}
