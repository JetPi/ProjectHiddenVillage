namespace ProjectHiddenVillage.Server;

/// <summary>
/// Why a game ended. The rules list exactly two losing conditions - a leader whose life points
/// reached 0, and a player who had to draw with an empty deck - and each of them maps to one member
/// here so the client can explain the result without re-deriving it.
/// </summary>
public enum GameEndReason
{
    /// <summary>A player's leader life points reached 0.</summary>
    LeaderLifeDepleted,

    /// <summary>A player had to draw a card but their deck had no cards left.</summary>
    DeckOut
}

/// <summary>
/// The terminal result of a game. Once a <see cref="GameState"/> carries one, no further action is
/// legal (the engine refuses every mutation) and the clients only offer the "return to main page"
/// affordance.
/// </summary>
public sealed class GameOutcome
{
    /// <summary>
    /// The winner's player id, or <c>null</c> for a draw (both players met a losing condition at the
    /// same time and every tiebreak metric was tied).
    /// </summary>
    public string? WinnerPlayerId { get; init; }

    /// <summary>Every player who met a losing condition, in the state's player order.</summary>
    public IReadOnlyList<string> LoserPlayerIds { get; init; } = [];

    /// <summary>Which condition ended the game (the first one to fire wins the label).</summary>
    public GameEndReason Reason { get; init; }

    /// <summary>The turn the game ended on, kept for the action log and diagnostics.</summary>
    public int TurnNumber { get; init; }
}
