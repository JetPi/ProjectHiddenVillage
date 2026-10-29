namespace ProjectHiddenVillage.Server.Api.Interfaces.Deck;

/// <summary>
/// Credits a finished game to the stored decks that played it.
///
/// The engine owns the moment a game ends - including the endings nobody called in for, such as the action clock
/// running out - so the engine is what hands the result over. Recording is deliberately fire-and-forget from the
/// caller's point of view: a statistics write must never fail a game that has already finished, and the outcome is
/// already final by the time this is called.
/// </summary>
public interface IGameResultRecorder
{
    /// <summary>
    /// Adds one win, one loss or one draw to each seated player's record for the deck they played. A game with no
    /// outcome, a player without a stored deck, and a guest identity (who owns nothing durable) are all no-ops.
    /// </summary>
    Task RecordAsync(GameInstance instance);
}
