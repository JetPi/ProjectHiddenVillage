using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using ErrorOr;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server;

/// <summary>
/// Quick match: the player queues for a ruleset and polls their ticket until it is matched. It is authenticated
/// exactly like play itself, which is why guests queue here without any special case.
/// </summary>
[ApiController]
[Route("api/matchmaking")]
public sealed class MatchmakingController(IMatchmakingService matchmakingService) : ApiControllerBase
{
    private readonly IMatchmakingService matchmakingService = matchmakingService;

    [HttpPost("queue")]
    [Authorize]
    [ProducesResponseType(typeof(MatchTicketResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(string), StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<MatchTicketResponse>> EnqueueMatch([FromBody] EnqueueMatchRequest request)
    {
        var requestingPlayerIdResult = GetRequestingPlayerId();
        if (requestingPlayerIdResult.IsError)
        {
            return ProblemFromErrors<MatchTicketResponse>(requestingPlayerIdResult.Errors);
        }

        if (request.UserId.ToString("N") != requestingPlayerIdResult.Value)
        {
            return ProblemFromErrors<MatchTicketResponse>(
            [
                Error.Unauthorized(
                    code: "Matchmaking.Enqueue.Forbidden",
                    description: "Authenticated player does not match the requested player.")
            ]);
        }

        var result = await matchmakingService.EnqueueAsync(request);
        if (result.IsError)
        {
            return ProblemFromErrors<MatchTicketResponse>(result.Errors);
        }

        return Ok(result.Value);
    }

    [HttpGet("queue/{ticketId}")]
    [Authorize]
    [ProducesResponseType(typeof(MatchTicketResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(string), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(string), StatusCodes.Status404NotFound)]
    public ActionResult<MatchTicketResponse> GetTicket(string ticketId)
    {
        var requestingPlayerIdResult = GetRequestingPlayerId();
        if (requestingPlayerIdResult.IsError)
        {
            return ProblemFromErrors<MatchTicketResponse>(requestingPlayerIdResult.Errors);
        }

        var result = matchmakingService.GetTicket(ticketId, ParsePlayerId(requestingPlayerIdResult.Value));
        if (result.IsError)
        {
            return ProblemFromErrors<MatchTicketResponse>(result.Errors);
        }

        return Ok(result.Value);
    }

    [HttpDelete("queue/{ticketId}")]
    [Authorize]
    [ProducesResponseType(typeof(MatchTicketResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(string), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(string), StatusCodes.Status404NotFound)]
    public ActionResult<MatchTicketResponse> CancelTicket(string ticketId)
    {
        var requestingPlayerIdResult = GetRequestingPlayerId();
        if (requestingPlayerIdResult.IsError)
        {
            return ProblemFromErrors<MatchTicketResponse>(requestingPlayerIdResult.Errors);
        }

        var result = matchmakingService.Cancel(ticketId, ParsePlayerId(requestingPlayerIdResult.Value));
        if (result.IsError)
        {
            return ProblemFromErrors<MatchTicketResponse>(result.Errors);
        }

        return Ok(result.Value);
    }

    private static Guid ParsePlayerId(string playerId)
    {
        return Guid.TryParse(playerId, out var parsed) ? parsed : Guid.Empty;
    }

    private ErrorOr<string> GetRequestingPlayerId()
    {
        var rawUserId = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue(JwtRegisteredClaimNames.Sub);

        if (string.IsNullOrWhiteSpace(rawUserId) || !Guid.TryParse(rawUserId, out var userId))
        {
            return Error.Unauthorized(
                code: "Matchmaking.Unauthorized",
                description: "Authenticated player id claim is missing or invalid.");
        }

        return userId.ToString("N");
    }
}
