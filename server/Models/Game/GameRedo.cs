namespace ProjectHiddenVillage.Server;

/// <summary>
/// One board the game can return to. It is captured before a player-initiated mutation, so it is the moment that
/// player was last in control; <see cref="Fingerprint"/> lets a request skip a point the board has already returned to.
/// </summary>
public sealed class RedoRewindPoint
{
    public string PointId { get; init; } = Guid.NewGuid().ToString("N");

    public DateTimeOffset CapturedAtUtc { get; init; } = DateTimeOffset.UtcNow;

    /// <summary>Player who was about to act, i.e. who was in control at this moment.</summary>
    public string CapturedForPlayerId { get; init; } = string.Empty;

    public int TurnNumber { get; init; }

    public GamePhase Phase { get; init; }

    public required GameState State { get; init; }

    public required IReadOnlyList<GamePrompt> PendingPrompts { get; init; }

    public required string Fingerprint { get; init; }
}

/// <summary>
/// A player asked to take the last move back and the table is waiting for the other player to agree. It is not a
/// <see cref="GamePrompt"/>: nothing is being decided about the board, the whole table is frozen until it resolves.
/// </summary>
public sealed class PendingRedoRequest
{
    public string RequestId { get; init; } = Guid.NewGuid().ToString("N");

    public string RequestedByPlayerId { get; init; } = string.Empty;

    public string ApproverPlayerId { get; init; } = string.Empty;

    /// <summary>The frozen rewind point; approval cannot be re-aimed at a later board.</summary>
    public string RewindPointId { get; init; } = string.Empty;

    public int TurnNumber { get; init; }

    public string Phase { get; init; } = string.Empty;

    public DateTimeOffset RequestedAtUtc { get; init; } = DateTimeOffset.UtcNow;
}
