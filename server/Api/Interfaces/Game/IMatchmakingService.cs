using ErrorOr;

namespace ProjectHiddenVillage.Server.Api.Interfaces.Game;

public interface IMatchmakingService
{
    /// <summary>
    /// Queues the player for a game under the given ruleset, pairing them with the oldest waiting player in the
    /// same ruleset when there is one. The returned ticket is already <c>matched</c> in that case.
    /// </summary>
    Task<ErrorOr<MatchTicketResponse>> EnqueueAsync(
        EnqueueMatchRequest request,
        CancellationToken cancellationToken = default);

    /// <summary>Current state of a ticket, readable only by the player who owns it.</summary>
    ErrorOr<MatchTicketResponse> GetTicket(string ticketId, Guid requestingUserId);

    /// <summary>Gives up a waiting ticket. A ticket that already matched is reported as matched, not cancelled.</summary>
    ErrorOr<MatchTicketResponse> Cancel(string ticketId, Guid requestingUserId);
}
