using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using ErrorOr;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using ProjectHiddenVillage.Server.Api.Hubs;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server;

[ApiController]
[Route("api/[controller]")]
public sealed class GamesController(
    IGameReadService gameReadService,
    IGameInstanceService gameInstanceService,
    IHubContext<GamesHub>? gamesHubContext = null) : ApiControllerBase
{
    private readonly IGameReadService gameReadService = gameReadService;
    private readonly IGameInstanceService gameInstanceService = gameInstanceService;
    private readonly IHubContext<GamesHub>? gamesHubContext = gamesHubContext;

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