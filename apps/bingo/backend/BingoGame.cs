using System.Security.Cryptography;
using System.Text;

namespace Bingo;

/// <summary>One lobby's rules. LobbyStore serializes access and emits only recipient DTOs.</summary>
public sealed class BingoGame
{
    private readonly Random random;
    public string Code { get; }
    public string HostId { get; }
    public string Phase { get; private set; } = "lobby";
    public string? EndReason { get; private set; }
    public int Round { get; private set; } = 1;
    public int Budget { get; private set; } = 10;
    public string Mode { get; private set; } = "random";
    public long Revision { get; private set; }
    public DateTimeOffset? StartedAt { get; private set; }
    public DateTimeOffset? ExpiresAt => StartedAt?.AddHours(6);
    public DateTimeOffset? AllDisconnectedAt { get; private set; }
    public bool IsClosed { get; private set; }
    public List<Player> Players { get; } = [];
    public List<Cell> Cells { get; } = [];
    public int Size => Players.Count;

    public BingoGame(string code, string hostName, int hostColor, DateTimeOffset now, Random? random = null)
    {
        Code = code;
        this.random = random ?? Random.Shared;
        var host = new Player { Name = ValidName(hostName), Color = ValidColor(hostColor), Token = Secret(), HostKey = Secret() };
        Players.Add(host);
        HostId = host.Id;
        AllDisconnectedAt = now;
    }

    public Player Join(string name, int color)
    {
        RequireLobby();
        if (Size >= 10) throw new BingoException("Ce lobby est complet (10 joueurs maximum).");
        name = ValidName(name);
        if (Players.Any(p => string.Equals(p.Name, name, StringComparison.OrdinalIgnoreCase)))
            throw new BingoException("Ce pseudo est déjà pris.");
        EnsureColorAvailable(color, null);
        var player = new Player { Name = name, Color = color, Token = Secret() };
        Players.Add(player);
        Changed();
        return player;
    }

    public Player Resume(string token)
    {
        if (string.IsNullOrEmpty(token) || token.Length > 128) throw new BingoException("La session n’est plus valide.");
        return Players.FirstOrDefault(p => SecretEquals(p.Token, token))
            ?? throw new BingoException("La session n’est plus valide. Récupérez votre place avec votre pseudo.");
    }

    public Player Recover(string name, string? hostKey)
    {
        name = ValidName(name);
        if (hostKey?.Length > 128) throw new BingoException("Le code de récupération est invalide.");
        var player = Players.FirstOrDefault(p => string.Equals(p.Name, name, StringComparison.OrdinalIgnoreCase))
            ?? throw new BingoException("Aucune place ne correspond à ce pseudo.");
        if (player.Connections.Count != 0) throw new BingoException("Cette personne est encore connectée.");
        if (player.Id == HostId && !SecretEquals(player.HostKey, hostKey))
            throw new BingoException("Le code de récupération de l’hôte est nécessaire.");
        player.Token = Secret();
        Changed();
        return player;
    }

    public void Connect(string playerId, string connectionId, DateTimeOffset now)
    {
        var player = FindPlayer(playerId);
        if (player.Connections.Count >= 5 && !player.Connections.Contains(connectionId))
            throw new BingoException("Trop d’onglets ouverts pour cette place. Fermez-en un.");
        player.Connections.Add(connectionId);
        AllDisconnectedAt = null;
        Changed();
    }

    public void Disconnect(string playerId, string connectionId, DateTimeOffset now)
    {
        var player = Players.FirstOrDefault(p => p.Id == playerId);
        if (player is null || !player.Connections.Remove(connectionId)) return;
        if (Players.All(p => p.Connections.Count == 0)) AllDisconnectedAt = now;
        Changed();
    }

    public void SetColor(string actorId, int color)
    {
        RequireLobby();
        var player = FindPlayer(actorId);
        EnsureColorAvailable(color, player.Id);
        if (player.Color == color) return;
        player.Color = color;
        Changed();
    }

    public void SavePreparation(string actorId, string[] words, int[] sips)
    {
        RequireLobby();
        var player = FindPlayer(actorId);
        if (words is null || sips is null || words.Length != Size || sips.Length != Size)
            throw new BingoException("Le nombre de joueurs a changé. Vérifiez vos mots avant d’enregistrer.");
        if (words.Any(word => word is null || word.Length > 60 || word.Any(char.IsControl)))
            throw new BingoException("Chaque mot doit contenir au maximum 60 caractères, sans retour à la ligne.");
        if (sips.Any(value => value is < 0 or > 100))
            throw new BingoException("Les gorgées doivent être des entiers de 0 à 100.");
        if (Mode == "manual" && sips.Sum() > Budget)
            throw new BingoException($"Votre répartition dépasse le budget de {Budget} gorgées.");
        // Keep entries beyond N so a temporarily smaller lobby does not erase somebody's draft.
        while (player.Words.Count < Size) player.Words.Add("");
        while (player.Sips.Count < Size) player.Sips.Add(0);
        for (var index = 0; index < Size; index++)
        {
            player.Words[index] = words[index].Trim();
            player.Sips[index] = Mode == "manual" ? sips[index] : 0;
        }
        Changed();
    }

    public void SetSettings(string actorId, int budget, string mode)
    {
        RequireHost(actorId);
        RequireLobby();
        if (budget is < 0 or > 100) throw new BingoException("Le budget doit être un entier de 0 à 100 par joueur.");
        if (mode is not ("manual" or "random")) throw new BingoException("Choisissez le mode manuel ou aléatoire.");
        if (Budget == budget && Mode == mode) return;
        Budget = budget;
        Mode = mode;
        Changed();
    }

    public bool CanStart => Phase == "lobby" && Size is >= 4 and <= 10 && Players.All(IsReady);

    public void Start(string actorId, DateTimeOffset now)
    {
        RequireHost(actorId);
        // A retransmitted start after a successful start cannot draw again.
        if (Phase != "lobby") return;
        if (!CanStart) throw new BingoException("Il faut 4 à 10 joueurs, chacun avec une couleur et ses mots prêts.");
        Cells.Clear();
        foreach (var player in Players)
        {
            var amounts = Mode == "random" ? RandomPartition(Budget, Size) : player.Sips.Take(Size).ToArray();
            for (var index = 0; index < Size; index++)
                Cells.Add(new Cell { OwnerId = player.Id, Word = player.Words[index], Sips = amounts[index] });
        }
        // Unconstrained Fisher–Yates: no row/column/diagonal balancing of ownership.
        for (var index = Cells.Count - 1; index > 0; index--)
        {
            var other = random.Next(index + 1);
            (Cells[index], Cells[other]) = (Cells[other], Cells[index]);
        }
        Phase = "playing";
        EndReason = null;
        StartedAt = now;
        Changed();
    }

    public Combination[] SetValidation(string actorId, string cellId, bool validated)
    {
        RequireHost(actorId);
        if (Phase == "lobby") throw new BingoException("La manche n’a pas encore commencé.");
        if (string.IsNullOrEmpty(cellId) || cellId.Length > 64) throw new BingoException("Cette case n’existe pas.");
        var cell = Cells.FirstOrDefault(c => c.Id == cellId) ?? throw new BingoException("Cette case n’existe pas.");
        // Set desired state instead of toggling: retransmissions/double taps are idempotent.
        if (cell.Validated == validated) return [];
        var oldIds = GetCombinations().Select(c => c.Id).ToHashSet();
        cell.Validated = validated;
        if (Cells.All(c => c.Validated) && EndReason != "manual")
        {
            Phase = "finished";
            EndReason = "automatic";
        }
        else if (EndReason == "automatic")
        {
            Phase = "playing";
            EndReason = null;
        }
        Changed();
        return GetCombinations().Where(c => !oldIds.Contains(c.Id)).ToArray();
    }

    public void EndRound(string actorId)
    {
        RequireHost(actorId);
        if (Phase == "lobby") throw new BingoException("La manche n’a pas encore commencé.");
        if (Phase == "finished") return;
        Phase = "finished";
        EndReason = "manual";
        Changed();
    }

    public void Rematch(string actorId)
    {
        RequireHost(actorId);
        if (Phase == "lobby" && Round > 1) return;
        if (Phase != "finished") throw new BingoException("Terminez la manche avant de préparer une revanche.");
        foreach (var player in Players)
        {
            player.Color = null;
            player.Words.Clear();
            player.Sips.Clear();
        }
        Cells.Clear();
        Phase = "lobby";
        EndReason = null;
        StartedAt = null;
        Round++;
        Changed();
    }

    public void Kick(string actorId, string playerId)
    {
        RequireHost(actorId);
        RequireLobby();
        if (playerId == HostId) throw new BingoException("L’hôte ne peut pas s’expulser.");
        var player = FindPlayer(playerId);
        Players.Remove(player);
        Changed();
    }

    public void RequireHost(string actorId)
    {
        FindPlayer(actorId);
        if (actorId != HostId) throw new BingoException("Seul l’hôte peut effectuer cette action.");
    }

    public void Close()
    {
        IsClosed = true;
        Changed();
    }

    public string? ExpirationReason(DateTimeOffset now, TimeSpan grace)
    {
        if (ExpiresAt is { } expiry && now >= expiry) return "La limite de 6 heures est atteinte. Le lobby est fermé.";
        if (AllDisconnectedAt is { } disconnected && now >= disconnected + grace)
            return "Le lobby a été fermé après la déconnexion de tous les joueurs.";
        return null;
    }

    // Anonymous inspection supports entry/recovery; it must not become a spectator leaderboard.
    public PublicLobby Inspect() => new(Code, Phase, PublicPlayers().Select(player => player with
    {
        Score = 0,
        WordCount = Phase == "lobby" ? player.WordCount : 0,
        Ready = Phase == "lobby" && player.Ready
    }).ToArray(), Budget, Mode);
    public Session SessionFor(Player player) => new(Code, player.Id, player.Token, player.Id == HostId ? player.HostKey : null);

    public Snapshot Snapshot(string selfId)
    {
        var player = FindPlayer(selfId);
        return new(Code, Revision, Phase, EndReason, Round, Size, Budget, Mode, HostId, selfId,
            FindPlayer(HostId).Connections.Count > 0, CanStart, StartedAt, ExpiresAt, PublicPlayers(),
            new Preparation(Enumerable.Range(0, Size).Select(i => player.Words.ElementAtOrDefault(i) ?? "").ToArray(),
                Enumerable.Range(0, Size).Select(i => player.Sips.ElementAtOrDefault(i)).ToArray()),
            Cells.Select(cell => new CellView(cell.Id, cell.OwnerId, cell.Word,
                cell.OwnerId == selfId || cell.Validated ? cell.Sips : null, cell.Validated)).ToArray(), GetCombinations());
    }

    public Combination[] GetCombinations()
    {
        if (Cells.Count == 0) return [];
        var combinations = new List<Combination>();
        for (var index = 0; index < Size; index++)
        {
            Add("row", index, Enumerable.Range(0, Size).Select(col => Cells[index * Size + col]));
            Add("column", index, Enumerable.Range(0, Size).Select(row => Cells[row * Size + index]));
        }
        Add("diagonal", 0, Enumerable.Range(0, Size).Select(i => Cells[i * Size + i]));
        Add("diagonal", 1, Enumerable.Range(0, Size).Select(i => Cells[i * Size + Size - 1 - i]));
        return combinations.ToArray();

        void Add(string kind, int index, IEnumerable<Cell> source)
        {
            var cells = source.ToArray();
            if (!cells.All(c => c.Validated)) return;
            var bonus = (int)Math.Round((decimal)cells.Sum(c => c.Sips) / Size, MidpointRounding.AwayFromZero);
            if (kind == "diagonal") bonus *= 2;
            var owners = cells.Select(c => c.OwnerId).ToHashSet();
            combinations.Add(new Combination($"{Round}-{kind}-{index}", kind, index,
                cells.Select(c => c.Id).ToArray(), bonus, Players.Where(p => !owners.Contains(p.Id)).Select(p => p.Id).ToArray()));
        }
    }

    private PublicPlayer[] PublicPlayers() => Players.Select(player => new PublicPlayer(player.Id, player.Name,
        player.Color, player.Connections.Count > 0, player.Id == HostId,
        player.Words.Take(Size).Count(word => !string.IsNullOrWhiteSpace(word)), IsReady(player),
        Cells.Where(cell => cell.OwnerId == player.Id && cell.Validated).Sum(cell => cell.Sips))).ToArray();

    private bool IsReady(Player player) => player.Color is not null && player.Words.Count >= Size &&
        player.Words.Take(Size).All(word => !string.IsNullOrWhiteSpace(word)) &&
        (Mode == "random" || (player.Sips.Count >= Size && player.Sips.Take(Size).Sum() <= Budget));

    private Player FindPlayer(string id) => Players.FirstOrDefault(p => p.Id == id)
        ?? throw new BingoException("Vous ne faites plus partie de ce lobby.");
    private void RequireLobby()
    {
        if (Phase != "lobby") throw new BingoException("La manche a commencé : les participants et la préparation sont figés.");
    }
    private void EnsureColorAvailable(int color, string? exceptId)
    {
        ValidColor(color);
        if (Players.Any(player => player.Id != exceptId && player.Color == color))
            throw new BingoException("Cette couleur vient d’être prise. Choisissez-en une autre.");
    }
    private static int ValidColor(int color) => color is >= 0 and < 10 ? color
        : throw new BingoException("Choisissez une des dix couleurs.");
    private static string ValidName(string? name)
    {
        if (name is null || name.Length > 24 || name.Any(char.IsControl)) throw new BingoException("Le pseudo doit contenir de 2 à 24 caractères.");
        name = name.Trim();
        if (name.Length < 2) throw new BingoException("Le pseudo doit contenir de 2 à 24 caractères.");
        return name;
    }
    private static string Secret() => Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
    private static bool SecretEquals(string? expected, string? actual) => expected is not null && actual is not null &&
        expected.Length == actual.Length && CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(actual));
    private void Changed() => Revision++;

    private int[] RandomPartition(int budget, int count)
    {
        // Uniform weak composition via stars and bars, not per-sip draws tending toward balance.
        // Every integer allocation is possible, including zeroes and the whole budget on one cell.
        var positions = Enumerable.Range(0, budget + count - 1).ToArray();
        for (var i = 0; i < count - 1; i++)
        {
            var other = random.Next(i, positions.Length);
            (positions[i], positions[other]) = (positions[other], positions[i]);
        }
        var bars = positions.Take(count - 1).Order().ToArray();
        var result = new int[count];
        var previous = -1;
        for (var i = 0; i < bars.Length; i++)
        {
            result[i] = bars[i] - previous - 1;
            previous = bars[i];
        }
        result[^1] = positions.Length - previous - 1;
        return result;
    }
}
