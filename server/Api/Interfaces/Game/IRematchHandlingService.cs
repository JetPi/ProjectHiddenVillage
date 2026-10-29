using ErrorOr;
using ProjectHiddenVillage.Server.Api.Services.Rematch;

namespace ProjectHiddenVillage.Server.Api.Interfaces.Game;

/// <summary>
/// Offering, answering and claiming a rematch. The offer lives on the finished <see cref="GameInstance"/> (so it
/// reaches both boards in the state payload), while the reserved table it produces lives in the reservation store
/// until the two players have claimed it from the login view.
/// </summary>
public interface IRematchHandlingService
{
    /// <summary>Records that this player wants another match, or answers the opponent's open offer.</summary>
    ErrorOr<GameInstance> RequestRematch(string gameId, string requestingPlayerId);

    /// <summary>Agrees to the opponent's offer, which reserves the next table and hands its code to both players.</summary>
    ErrorOr<GameInstance> AcceptRematch(string gameId, string respondingPlayerId);

    /// <summary>Refuses the offer (or withdraws one's own), which settles the rematch for both players.</summary>
    ErrorOr<GameInstance> DeclineRematch(string gameId, string respondingPlayerId);

    /// <summary>
    /// The live reservation behind a reserved code, for the join path and for the ruleset pre-check on the join form.
    /// Fails with <c>Game.Rematch.NotFound</c> for an unknown code, <c>Game.Rematch.Expired</c> for a lapsed one and
    /// <c>Game.Rematch.Released</c> when a player left and did not come back.
    /// </summary>
    /// <param name="requestingPlayerId">
    /// Who is asking. A seat asking again proves they are still in the flow, so a release that player asked for is
    /// cancelled. The opponent asking does not: watching a banner is not a commitment.
    /// </param>
    /// <param name="cancelsPendingRelease">
    /// True on the claim path, where either seat acting on the agreement makes any pending release moot.
    /// </param>
    ErrorOr<RematchReservation> GetActiveReservation(
        string gameCode,
        string? requestingPlayerId = null,
        bool cancelsPendingRelease = false);

    /// <summary>
    /// Asks for the reservation to be dropped because this player has left the login view without claiming. The drop
    /// is deferred by <see cref="RematchOptions.ReleaseGraceSeconds"/> so a refresh is not mistaken for a departure;
    /// claiming a seat, or this player coming back, cancels it. Idempotent.
    /// </summary>
    ErrorOr<Success> ReleaseReservation(string gameCode, string playerId);

    /// <summary>
    /// Drops, immediately, every reservation this player holds - they have just told us where they went by hosting,
    /// joining another table or queueing. Returns the codes that were dropped.
    /// </summary>
    /// <param name="exceptGameCode">
    /// The code being claimed right now, which must survive: claiming a rematch table is not moving on from it.
    /// </param>
    IReadOnlyList<string> ReleaseReservationsForPlayer(string playerId, string? exceptGameCode = null);

    /// <summary>Drops a reservation whose table has both players seated. The code stays claimed by that table.</summary>
    void CompleteReservation(string gameCode);
}
