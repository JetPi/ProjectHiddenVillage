using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using ErrorOr;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server;

[ApiController]
[Route("api/[controller]")]
public sealed class GamesController(
    IGameReadService gameReadService) : ApiControllerBase
{
    private readonly IGameReadService gameReadService = gameReadService;

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