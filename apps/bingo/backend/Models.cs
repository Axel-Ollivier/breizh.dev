namespace Bingo;

public sealed class BingoException(string message) : Exception(message);

// Internal game state never goes directly over the wire. DTOs below apply recipient visibility.
public sealed class Player
{
    public string Id { get; init; } = Guid.NewGuid().ToString("N");
    public required string Name { get; init; }
    public int? Color { get; set; }
    public required string Token { get; set; }
    public string? HostKey { get; init; }
    public HashSet<string> Connections { get; } = [];
    public List<string> Words { get; } = [];
    public List<int> Sips { get; } = [];
}

public sealed class Cell
{
    public string Id { get; init; } = Guid.NewGuid().ToString("N");
    public required string OwnerId { get; init; }
    public required string Word { get; init; }
    public int Sips { get; init; }
    public bool Validated { get; set; }
}

public sealed record Session(string Code, string PlayerId, string Token, string? HostKey);
public sealed record PublicPlayer(string Id, string Name, int? Color, bool Connected, bool IsHost,
    int WordCount, bool Ready, int Score);
public sealed record PublicLobby(string Code, string Phase, PublicPlayer[] Players, int Budget, string Mode);
public sealed record Preparation(string[] Words, int[] Sips);
public sealed record CellView(string Id, string OwnerId, string Word, int? Sips, bool Validated);
public sealed record Combination(string Id, string Kind, int Index, string[] CellIds, int Bonus,
    string[] RecipientIds);
public sealed record Activation(long Revision, Combination[] Combinations);
public sealed record Snapshot(string Code, long Revision, string Phase, string? EndReason, int Round,
    int Size, int Budget, string Mode, string HostId, string SelfId, bool HostConnected, bool CanStart,
    DateTimeOffset? StartedAt, DateTimeOffset? ExpiresAt, PublicPlayer[] Players,
    Preparation OwnPreparation, CellView[] Cells, Combination[] Combinations);

public sealed class BingoOptions
{
    public int DisconnectGraceSeconds { get; set; } = 60;
    public int MaxLobbies { get; set; } = 500;
}
