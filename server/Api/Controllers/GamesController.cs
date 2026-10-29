using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using ErrorOr;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using ProjectHiddenVillage.Server.Api.Hubs;
using ProjectHiddenVillage.Server.Api.Interfaces.Deck;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server;

[ApiController]
[Route("api/[controller]")]
public sealed class GamesController(
    IGameReadService gameReadService,
    IGameInstanceService gameInstanceService,
    IHubContext<GamesHub>? gamesHubContext = null,
    IRematchHandlingService? rematchHandlingService = null,
    IDeckRulesetService? deckRulesetService = null) : ApiControllerBase
{
    private readonly IGameReadService gameReadService = gameReadService;
    private readonly IGameInstanceService gameInstanceService = gameInstanceService;
    private readonly IHubContext<GamesHub>? gamesHubContext = gamesHubContext;
    private readonly IRematchHandlingService? rematchHandlingService = rematchHandlingService;
    private readonly IDeckRulesetService? deckRulesetService = deckRulesetService;

    [HttpPost]
    [Authorize]
    [ProducesResponseType(typeof(GameInstanceResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(string), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<GameInstanceResponse>> CreateGame([FromBody] CreateGameForUserRequest request)
    {
        var requestingPlayerIdResult = GetRequestingPlayerId();
        if (requestingPlayerIdResult.IsError)
        {
            return ProblemFromErrors<GameInstanceResponse>(requestingPlayerIdResult.Errors);
        }

        if (request.UserId.ToString("N") != requestingPlayerIdResult.Value)
        {
            return ProblemFromErrors<GameInstanceResponse>(
            [
                Error.Unauthorized(
                    code: "Game.CreateForUser.Forbidden",
                    description: "Authenticated user does not match requested user.")
            ]);
        }

        var result = await gameInstanceService.CreateGameForUser(request);
        if (result.IsError)
        {
            return ProblemFromErrors<GameInstanceResponse>(result.Errors);
        }

        return Ok(new GameInstanceResponse(result.Value.Id));
    }

    [HttpPost("{gameId}/join")]
    [Authorize]
    [ProducesResponseType(typeof(GameInstanceResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(string), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<GameInstanceResponse>> JoinGame(string gameId, [FromBody] JoinGameAsPlayer request)
    {
        var requestingPlayerIdResult = GetRequestingPlayerId();
        if (requestingPlayerIdResult.IsError)
        {
            return ProblemFromErrors<GameInstanceResponse>(requestingPlayerIdResult.Errors);
        }

        if (request.UserId.ToString("N") != requestingPlayerIdResult.Value)
        {
            return ProblemFromErrors<GameInstanceResponse>(
            [
                Error.Unauthorized(
                    code: "Game.JoinForUser.Forbidden",
                    description: "Authenticated user does not match requested user.")
            ]);
        }

        var result = await gameInstanceService.JoinGameForUser(gameId, request);
        if (result.IsError)
        {
            return ProblemFromErrors<GameInstanceResponse>(result.Errors);
        }

        if (gamesHubContext is not null)
        {
            try
            {
                await gamesHubContext.Clients.Group(result.Value.Id).SendAsync("GameStateInvalidated", result.Value.Id);
            }
            catch
            {
                // Best effort only: join should still succeed even if notification fails.
            }
        }

        return Ok(new GameInstanceResponse(result.Value.Id));
    }

    [HttpGet("{gameId}/state")]
    [Authorize]
    [ProducesResponseType(typeof(GameStateResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(string), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public ActionResult<GameStateResponse> GetCurrentGameState(string gameId)
    {
        var requestingPlayerIdResult = GetRequestingPlayerId();
        if (requestingPlayerIdResult.IsError)
        {
            return ProblemFromErrors<GameStateResponse>(requestingPlayerIdResult.Errors);
        }

        var result = gameReadService.GetById(gameId);
        if (result.IsError)
        {
            return ProblemFromErrors<GameStateResponse>(result.Errors);
        }

        if (!result.Value.State.Players.Any(player =>
                string.Equals(player.PlayerId, requestingPlayerIdResult.Value, StringComparison.Ordinal)))
        {
            return ProblemFromErrors<GameStateResponse>(
            [
                Error.Unauthorized(
                    code: "Game.GetCurrentState.Forbidden",
                    description: "Current user is not a player in this game.")
            ]);
        }

        return Ok(GameStateResponseMapper.ToGameStateResponse(result.Value, requestingPlayerIdResult.Value));
    }

    [HttpGet("{gameId}/cards")]
    [ProducesResponseType(typeof(List<CardCatalogItemResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(string), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<List<CardCatalogItemResponse>>> GetCardsForGame(string gameId)
    {
        var result = await gameReadService.GetCardDataForGame(gameId);
        if (result.IsError)
        {
            return ProblemFromErrors<List<CardCatalogItemResponse>>(result.Errors);
        }

        return Ok(result.Value);
    }

    /// <summary>
    /// The format a game is played in, so a player holding a code can judge their deck before asking to join.
    /// Anonymous like the card read above: the code is the secret and the caller is not a player of the game yet.
    /// An unbound game answers null, because it has no format to check against.
    ///
    /// A code that has no table yet is answered from its rematch reservation: the two players agreed on another
    /// match, the table is waiting to be claimed, and they have to be able to check their decks before they join it.
    /// This is also the check the login view makes when it comes back with a reserved code, so it has to be honest
    /// about a rematch that is no longer feasible: a lapsed or released reservation and a deactivated format are
    /// answered with their own errors rather than with a binding that would only fail on the claim.
    /// </summary>
    [HttpGet("{gameId}/ruleset")]
    [ProducesResponseType(typeof(GameRulesetBindingResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(string), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<GameRulesetBindingResponse?>> GetGameRuleset(string gameId)
    {
        var result = gameReadService.GetById(gameId);

        if (result.IsError && rematchHandlingService is not null)
        {
            // The caller's identity matters: a seat asking again proves it is still in the flow, which cancels a
            // release that player asked for. An anonymous caller (no identity yet) can only read.
            var requestingPlayerId = GetRequestingPlayerId();
            var reservationResult = rematchHandlingService.GetActiveReservation(
                gameId,
                requestingPlayerId.IsError ? null : requestingPlayerId.Value);

            if (!reservationResult.IsError)
            {
                var reservation = reservationResult.Value;

                if (reservation.Ruleset is { } reservedBinding)
                {
                    // The snapshot says what the match was played under; the live definition says whether that format
                    // still exists. A format deactivated between matches must not wait for a claim to be refused.
                    if (deckRulesetService is not null)
                    {
                        var definitionResult = await deckRulesetService.GetActiveRulesetDefinition(reservedBinding.Id);

                        if (definitionResult.IsError)
                        {
                            return ProblemFromErrors<GameRulesetBindingResponse?>(
                            [
                                Error.Validation(
                                    code: "Game.Rematch.RulesetUnavailable",
                                    description: $"The format '{reservedBinding.Name}' is no longer available, so this rematch cannot start.")
                            ]);
                        }
                    }

                    return Ok(new GameRulesetBindingResponse(
                        reservedBinding.Id.ToString(),
                        reservedBinding.Key,
                        reservedBinding.Name));
                }

                return Ok(null);
            }

            // Lapsed, released or otherwise gone: answer why, so the banner can be cleared with the right words
            // instead of showing a code that no longer means anything.
            if (reservationResult.FirstError.Code is "Game.Rematch.Expired" or "Game.Rematch.Released")
            {
                return ProblemFromErrors<GameRulesetBindingResponse?>(reservationResult.Errors);
            }
        }

        if (result.IsError)
        {
            return ProblemFromErrors<GameRulesetBindingResponse?>(result.Errors);
        }

        var binding = result.Value.Ruleset;
        if (binding is null)
        {
            return Ok(null);
        }

        return Ok(new GameRulesetBindingResponse(binding.Id.ToString(), binding.Key, binding.Name));
    }

    /// <summary>
    /// A player is leaving the reserved rematch table without claiming a seat. The drop is deferred by a short grace
    /// so a refresh is not mistaken for a departure; claiming, or coming back, cancels it. Called from the login
    /// view when it unmounts or the tab goes away, so it is cheap and idempotent by design.
    /// </summary>
    [HttpPost("{gameId}/rematch/release")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public ActionResult<object> ReleaseRematch(string gameId)
    {
        if (rematchHandlingService is null)
        {
            return ProblemFromErrors<object>(
            [
                Error.NotFound(code: "Game.Rematch.NotFound", description: "No rematch table is reserved for this code.")
            ]);
        }

        var requestingPlayerIdResult = GetRequestingPlayerId();
        if (requestingPlayerIdResult.IsError)
        {
            return ProblemFromErrors<object>(requestingPlayerIdResult.Errors);
        }

        var result = rematchHandlingService.ReleaseReservation(gameId, requestingPlayerIdResult.Value);
        if (result.IsError)
        {
            return ProblemFromErrors<object>(result.Errors);
        }

        return NoContent();
    }

    private ErrorOr<string> GetRequestingPlayerId()
    {
        var rawUserId = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue(JwtRegisteredClaimNames.Sub);

        if (string.IsNullOrWhiteSpace(rawUserId))
        {
            return Error.Unauthorized(
                code: "Game.GetCurrentState.Unauthorized",
                description: "Authenticated user id claim is missing.");
        }

        if (!Guid.TryParse(rawUserId, out var userId))
        {
            return Error.Unauthorized(
                code: "Game.GetCurrentState.Unauthorized",
                description: "Authenticated user id claim is invalid.");
        }

        return userId.ToString("N");
    }

}