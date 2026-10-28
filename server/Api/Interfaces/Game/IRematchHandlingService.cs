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
    /// Fails with <c>Game.Rematch.NotFound</c> for an unknown code and <c>Game.Rematch.Expired</c> for a lapsed one.
    /// </summary>
    ErrorOr<RematchReservation> GetActiveReservation(string gameCode);

    /// <summary>Drops a reservation whose table has both players seated. The code stays claimed by that table.</summary>
    void CompleteReservation(string gameCode);
}
