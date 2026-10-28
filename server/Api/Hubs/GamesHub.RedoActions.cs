using ErrorOr;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Api.Hubs;

/// <summary>
/// Taking a move back. These are not board actions: a request freezes the table before it changes, and the answer
/// is what lifts the freeze, so they cannot be routed through the gate that refuses mutations while one is
/// outstanding. They follow the acknowledgement and the forfeit in having their own path.
/// </summary>
public sealed partial class GamesHub
{
    public async Task<HubOperationResult<GameStateResponse>> RequestRedo(string gameId)
    {
        return await ExecuteRedoOperation(
            gameId,
            operationName: "Game.RequestRedo",
            operation: playerId => gameRedoHandlingService.RequestRedo(NormalizeGameId(gameId), playerId));
    }

    public async Task<HubOperationResult<GameStateResponse>> RespondToRedo(string gameId, string requestId, bool accepted)
    {
        return await ExecuteRedoOperation(
            gameId,
            operationName: "Game.RespondToRedo",
            operation: playerId => gameRedoHandlingService.RespondToRedo(
                NormalizeGameId(gameId),
                playerId,
                requestId,
                accepted));
    }

    public async Task<HubOperationResult<GameStateResponse>> CancelRedo(string gameId)
    {
        return await ExecuteRedoOperation(
            gameId,
            operationName: "Game.CancelRedo",
            operation: playerId => gameRedoHandlingService.CancelRedo(NormalizeGameId(gameId), playerId));
    }

    private async Task<HubOperationResult<GameStateResponse>> ExecuteRedoOperation(
        string gameId,
        string operationName,
        Func<string, ErrorOr<GameInstance>> operation)
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
            result = operation(requesterIdResult.Value);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Game operation {Operation} threw for game {GameId}.", operationName, gameId);
            result = Error.Unexpected(code: $"{operationName}.Unexpected", description: ex.Message);
        }

        if (result.IsError)
        {
            await NotifyGameStateInvalidatedAsync(gameResult.Value);
            return HubOperationResult<GameStateResponse>.FromErrors(result.Errors);
        }

        var stateResponse = GameStateResponseMapper.ToGameStateResponse(result.Value, requesterIdResult.Value);
        await NotifyGameStateInvalidatedAsync(result.Value);

        return HubOperationResult<GameStateResponse>.Success(stateResponse);
    }
}
