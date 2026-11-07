using Xunit;

namespace Bingo.Tests;

public sealed class CombinationTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 7, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Completed_row_includes_zero_cells_rounds_half_up_and_gives_full_bonus_to_each_absent_player()
    {
        var game = Board(4, i => i / 4, i => i < 4 ? new[] { 0, 1, 4, 5 }[i] : 0);
        for (var i = 1; i < 4; i++) game.SetValidation(game.HostId, game.Cells[i].Id, true);
        Assert.Empty(game.GetCombinations());
        var activated = game.SetValidation(game.HostId, game.Cells[0].Id, true);
        var row = Assert.Single(activated);
        Assert.Equal("row", row.Kind);
        Assert.Equal(0, row.Index);
        Assert.Equal(3, row.Bonus); // (0+1+4+5)/4 = 2.5 → 3, with no division among recipients.
        Assert.Equal(game.Players.Skip(1).Select(p => p.Id), row.RecipientIds);
        var scores = game.Snapshot(game.HostId).Players;
        Assert.Equal(10, scores[0].Score);
        Assert.All(scores.Skip(1), p => Assert.Equal(0, p.Score));
    }

    [Fact]
    public void A_column_with_every_player_present_has_no_bonus_recipient()
    {
        var game = Board(4, i => i / 4, _ => 3);
        foreach (var index in new[] { 1, 5, 9, 13 }) game.SetValidation(game.HostId, game.Cells[index].Id, true);
        var column = Assert.Single(game.GetCombinations());
        Assert.Equal("column", column.Kind);
        Assert.Equal(1, column.Index);
        Assert.Equal(3, column.Bonus);
        Assert.Empty(column.RecipientIds);
    }

    [Theory]
    [InlineData(5, 12, 4)] // 2.4 → 2 → 4; rounding 4.8 afterwards would incorrectly give 5.
    [InlineData(4, 10, 6)] // 2.5 → 3 → 6; half-integers round upward.
    [InlineData(4, 0, 0)]
    public void Main_diagonal_rounds_the_mean_before_doubling(int size, int total, int expected)
    {
        var game = Board(size, i => (i % size - i / size + size) % size, i => i == 0 ? total : 0);
        for (var i = 0; i < size; i++) game.SetValidation(game.HostId, game.Cells[i * size + i].Id, true);
        var diagonal = Assert.Single(game.GetCombinations());
        Assert.Equal("diagonal", diagonal.Kind);
        Assert.Equal(0, diagonal.Index);
        Assert.Equal(expected, diagonal.Bonus);
        Assert.Equal(game.Players.Skip(1).Select(p => p.Id), diagonal.RecipientIds);
    }

    [Fact]
    public void Anti_diagonal_counts_presence_once_and_does_not_include_short_diagonals()
    {
        var game = Board(4, i => (i % 4 - i / 4 + 4) % 4, _ => 2);
        foreach (var index in new[] { 1, 6, 11 }) game.SetValidation(game.HostId, game.Cells[index].Id, true);
        Assert.Empty(game.GetCombinations());
        foreach (var index in new[] { 3, 6, 9, 12 }) game.SetValidation(game.HostId, game.Cells[index].Id, true);
        var diagonal = Assert.Single(game.GetCombinations());
        Assert.Equal("diagonal", diagonal.Kind);
        Assert.Equal(1, diagonal.Index);
        Assert.Equal(4, diagonal.Bonus);
        Assert.Equal(new[] { game.Players[0].Id, game.Players[2].Id }, diagonal.RecipientIds);
    }

    [Fact]
    public void Simultaneous_combinations_stack_without_adding_their_bonuses_to_personal_scores()
    {
        // This valid free-placement board has four cells per player. The final center-left
        // validation completes a row and column both excluding Player 3.
        var owners = new[]
        {
            0, 0, 1, 1,
            0, 0, 2, 2,
            1, 2, 3, 3,
            1, 2, 3, 3
        };
        var game = Board(4, i => owners[i], _ => 3);
        foreach (var index in new[] { 1, 2, 3, 4, 8, 12 }) game.SetValidation(game.HostId, game.Cells[index].Id, true);
        Assert.Empty(game.GetCombinations());
        var activated = game.SetValidation(game.HostId, game.Cells[0].Id, true);
        Assert.Equal(2, activated.Length);
        var absent = game.Players[3].Id;
        Assert.Equal(6, activated.Where(c => c.RecipientIds.Contains(absent)).Sum(c => c.Bonus));
        Assert.Equal(0, game.Snapshot(absent).Players.Single(p => p.Id == absent).Score);
        Assert.Equal(21, game.Snapshot(absent).Players.Sum(p => p.Score));
        Assert.Equal(2, game.GetCombinations().Length);
    }

    [Fact]
    public void Undo_recalculates_scores_and_combinations_and_recompletion_does_not_accumulate_duplicates()
    {
        var game = Board(4, i => i / 4, _ => 2);
        foreach (var cell in game.Cells.Take(4)) game.SetValidation(game.HostId, cell.Id, true);
        var initial = Assert.Single(game.GetCombinations());
        var revision = game.Revision;
        Assert.Empty(game.SetValidation(game.HostId, game.Cells[0].Id, true));
        Assert.Equal(revision, game.Revision);
        Assert.Equal(8, game.Snapshot(game.HostId).Players[0].Score);
        game.SetValidation(game.HostId, game.Cells[0].Id, false);
        Assert.Empty(game.GetCombinations());
        Assert.Equal(6, game.Snapshot(game.HostId).Players[0].Score);
        var again = Assert.Single(game.SetValidation(game.HostId, game.Cells[0].Id, true));
        Assert.Equal(initial.Id, again.Id);
        Assert.Single(game.GetCombinations());
        Assert.Equal(8, game.Snapshot(game.HostId).Players[0].Score);
        Assert.Equal(2, game.GetCombinations().Sum(c => c.Bonus));
    }

    [Fact]
    public void Full_board_has_only_N_rows_N_columns_and_two_large_diagonals()
    {
        var game = Board(4, i => i / 4, _ => 0);
        foreach (var cell in game.Cells) game.SetValidation(game.HostId, cell.Id, true);
        var combinations = game.GetCombinations();
        Assert.Equal(10, combinations.Length);
        Assert.Equal(4, combinations.Count(c => c.Kind == "row"));
        Assert.Equal(4, combinations.Count(c => c.Kind == "column"));
        Assert.Equal(2, combinations.Count(c => c.Kind == "diagonal"));
        Assert.All(combinations, c => Assert.Equal(0, c.Bonus));
        Assert.Equal("finished", game.Phase);
    }

    private static BingoGame Board(int size, Func<int, int> owner, Func<int, int> sips)
    {
        var game = GameTests.Prepared(size);
        game.Start(game.HostId, Now);
        game.Cells.Clear();
        for (var i = 0; i < size * size; i++)
            game.Cells.Add(new Cell { Id = $"cell-{i}", OwnerId = game.Players[owner(i)].Id, Word = "duplicate", Sips = sips(i) });
        Assert.All(game.Players, p => Assert.Equal(size, game.Cells.Count(c => c.OwnerId == p.Id)));
        return game;
    }
}
