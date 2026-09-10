using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using ErrorOr;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Api.Hubs;

public sealed partial class GamesHub
{
    /// <summary>
    /// Runs an authorized game mutation and always tells the game group that the authoritative state
    /// changed - including when the operation failed. A failed operation can still have partially
    /// mutated the game (for example a battle action that rests the attacker before an unsupported
    /// "On Attack" effect aborts), so without the notification both clients would keep a stale
    /// snapshot and every follow-up action would fail, leaving the table stuck until a manual reload.
    /// </summary>
    private async Task<HubOperationResult<GameStateResponse>> ExecuteAuthorizedGameMutation(
        string gameId,
        string operationName,
        Func<ErrorOr<GameInstance>> operation)
    {
        var requesterIdResult = GetRequestingPlayerId();
        if (requesterIdResult.IsError)
        {
            return HubOperationResult<GameStateResponse>.FromErrors(requesterIdResult.Errors);
        }

        var gameResult = GetAuthorizedGameInstance(gameId, requesterIdResult.Value);
        if (gameResult.IsError)
        {
            return HubOperationResult<GameStateResponse>.FromErrors(gameResult.Errors);
        }

        ErrorOr<GameInstance> result;

        try
        {
            result = operation();
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(
                ex,
                "Game operation {Operation} threw for game {GameId}.",
                operationName,
                gameId);
            result = Error.Unexpected(code: $"{operationName}.Unexpected", description: ex.Message);
        }

        if (result.IsError)
        {
            var error = result.FirstError;
            logger.LogWarning(
                "Game operation {Operation} failed for game {GameId}: {ErrorCode} - {ErrorDescription}",
                operationName,
                gameId,
                error.Code,
                error.Description);

            await NotifyGameStateInvalidatedAsync(gameResult.Value);
            return HubOperationResult<GameStateResponse>.FromErrors(result.Errors);
        }

        var stateResponse = GameStateResponseMapper.ToGameStateResponse(result.Value, requesterIdResult.Value);
        await NotifyGameStateInvalidatedAsync(result.Value);

        return HubOperationResult<GameStateResponse>.Success(stateResponse);
    }

    private async Task NotifyGameStateInvalidatedAsync(GameInstance game)
    {
        var normalizedGameId = NormalizeGameId(game.Id);
        await Groups.AddToGroupAsync(Context.ConnectionId, normalizedGameId);
        await Clients.Group(normalizedGameId).SendAsync("GameStateInvalidated", normalizedGameId);
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
