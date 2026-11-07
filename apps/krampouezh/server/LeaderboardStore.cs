using System.Globalization;
using System.Text;
using Microsoft.Data.Sqlite;

namespace Krampouezh;

public sealed record ScoreSubmission(Guid Id, string? Name, int Score);
public sealed record ScoreEntry(Guid Id, string Name, int Score, DateTimeOffset CreatedAt);
public sealed record Leaderboard(ScoreEntry[] Entries, long Total, long? Rank);
public sealed class ScoreConflictException : Exception;

public static class ScoreValidation
{
    public static bool TryNormalize(ScoreSubmission submission, out string name)
    {
        name = submission.Name?.Trim() ?? "";
        if (submission.Id == Guid.Empty || submission.Score is < 1 or > 1_000_000 || submission.Name is null)
            return false;
        foreach (var rune in submission.Name.EnumerateRunes())
            if (Rune.GetUnicodeCategory(rune) is UnicodeCategory.Control or UnicodeCategory.Format)
                return false;
        var length = 0;
        foreach (var _ in name.EnumerateRunes()) length++;
        return length is >= 2 and <= 20;
    }
}

/// <summary>All submitted runs are retained; only the first 100 are returned.</summary>
public sealed class LeaderboardStore
{
    private readonly object gate = new();
    private readonly string connectionString;
    private readonly TimeProvider clock;

    public LeaderboardStore(string dataPath, TimeProvider? clock = null)
    {
        this.clock = clock ?? TimeProvider.System;
        var path = Path.GetFullPath(dataPath);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = path,
            Mode = SqliteOpenMode.ReadWriteCreate,
            Pooling = false,
            DefaultTimeout = 5
        }.ToString();
        using var connection = Open();
        using var command = connection.CreateCommand();
        command.CommandText = """
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS scores (
                sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                id TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 1000000),
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS scores_ranking ON scores (score DESC, sequence ASC);
            """;
        command.ExecuteNonQuery();
    }

    public Leaderboard Read(Guid? id = null)
    {
        lock (gate)
        {
            using var connection = Open();
            return Snapshot(connection, id);
        }
    }

    public Leaderboard Submit(ScoreSubmission submission)
    {
        if (!ScoreValidation.TryNormalize(submission, out var name))
            throw new ArgumentException("Invalid score submission.", nameof(submission));
        lock (gate)
        {
            using var connection = Open();
            using (var transaction = connection.BeginTransaction())
            {
                using var existing = connection.CreateCommand();
                existing.Transaction = transaction;
                existing.CommandText = "SELECT name, score FROM scores WHERE id = $id";
                existing.Parameters.AddWithValue("$id", submission.Id.ToString());
                using var reader = existing.ExecuteReader();
                if (reader.Read())
                {
                    if (reader.GetString(0) != name || reader.GetInt32(1) != submission.Score)
                        throw new ScoreConflictException();
                    reader.Close();
                }
                else
                {
                    reader.Close();
                    using var insert = connection.CreateCommand();
                    insert.Transaction = transaction;
                    insert.CommandText = "INSERT INTO scores (id, name, score, created_at) VALUES ($id, $name, $score, $createdAt)";
                    insert.Parameters.AddWithValue("$id", submission.Id.ToString());
                    insert.Parameters.AddWithValue("$name", name);
                    insert.Parameters.AddWithValue("$score", submission.Score);
                    insert.Parameters.AddWithValue("$createdAt", clock.GetUtcNow().ToString("O", CultureInfo.InvariantCulture));
                    insert.ExecuteNonQuery();
                }
                transaction.Commit();
            }
            return Snapshot(connection, submission.Id);
        }
    }

    private SqliteConnection Open()
    {
        var connection = new SqliteConnection(connectionString);
        try
        {
            connection.Open();
            return connection;
        }
        catch
        {
            connection.Dispose();
            throw;
        }
    }

    private static Leaderboard Snapshot(SqliteConnection connection, Guid? id)
    {
        using var transaction = connection.BeginTransaction(deferred: true);
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "SELECT id, name, score, created_at FROM scores ORDER BY score DESC, sequence ASC LIMIT 100";
        var entries = new List<ScoreEntry>();
        using (var reader = command.ExecuteReader())
        {
            while (reader.Read())
                entries.Add(new ScoreEntry(Guid.Parse(reader.GetString(0)), reader.GetString(1), reader.GetInt32(2),
                    DateTimeOffset.Parse(reader.GetString(3), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind)));
        }
        command.CommandText = "SELECT COUNT(*) FROM scores";
        var total = (long)command.ExecuteScalar()!;
        long? rank = null;
        if (id.HasValue)
        {
            command.CommandText = """
                SELECT 1 + (SELECT COUNT(*) FROM scores AS better
                    WHERE better.score > current.score
                       OR (better.score = current.score AND better.sequence < current.sequence))
                FROM scores AS current WHERE current.id = $id
                """;
            command.Parameters.AddWithValue("$id", id.Value.ToString());
            rank = command.ExecuteScalar() as long?;
        }
        transaction.Commit();
        return new Leaderboard(entries.ToArray(), total, rank);
    }
}
