using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using ErrorOr;
using Microsoft.AspNetCore.SignalR;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Api.Hubs;

public sealed partial class GamesHub
{
    private async Task<HubOperationResult<GameStateResponse>> PublishGameMutationResult(ErrorOr<GameInstance> result, string requestingPlayerId)
    {
        if (result.IsError)
        {
            return HubOperationResult<GameStateResponse>.FromErrors(result.Errors);
        }

        var game = result.Value;
        var normalizedGameId = NormalizeGameId(game.Id);
        await Groups.AddToGroupAsync(Context.ConnectionId, normalizedGameId);
        await Clients.Group(normalizedGameId).SendAsync("GameStateInvalidated", normalizedGameId);

        var stateResponse = GameStateResponseMapper.ToGameStateResponse(game, requestingPlayerId);
        return HubOperationResult<GameStateResponse>.Success(stateResponse);
    }

    private ErrorOr<GameInstance> GetAuthorizedGameInstance(string gameId, string requestingPlayerId)
    {
        var gameResult = gameReadService.GetById(NormalizeGameId(gameId));
        if (gameResult.IsError)
        {
            return gameResult.Errors;
        }

        var isPlayerInGame = gameResult.Value.State.Players.Any(player =>
            string.Equals(player.PlayerId, requestingPlayerId, StringComparison.Ordinal));

        if (!isPlayerInGame)
        {
            return Error.Unauthorized(
                code: "Game.Hub.Forbidden",
                description: "Current user is not a player in this game.");
        }

        return gameResult.Value;
    }

    private ErrorOr<string> GetRequestingPlayerId()
    {
        var rawUserId = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? Context.User?.FindFirstValue(JwtRegisteredClaimNames.Sub);

        if (string.IsNullOrWhiteSpace(rawUserId))
        {
            return Error.Unauthorized(
                code: "Game.Hub.Unauthorized",
                description: "Authenticated user id claim is missing.");
        }

        if (!Guid.TryParse(rawUserId, out var userId))
        {
            return Error.Unauthorized(
                code: "Game.Hub.Unauthorized",
                description: "Authenticated user id claim is invalid.");
        }

        return userId.ToString("N");
    }

    private static string NormalizeGameId(string gameId)
    {
        return gameId.Trim().ToUpperInvariant();
    }
}
