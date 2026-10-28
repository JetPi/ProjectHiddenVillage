using ErrorOr;
using Microsoft.Extensions.Logging;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class GameRedoHandlingService(
    InMemoryGameInstanceRegistry registry,
    ILogger<GameRedoHandlingService> logger) : IGameRedoHandlingService
{
    public ErrorOr<GameInstance> RequestRedo(string gameId, string playerId)
    {
        if (string.IsNullOrWhiteSpace(playerId))
        {
            return Error.Validation(
                code: "Game.RequestRedo.InvalidRequest",
                description: "A player id is required.");
        }

        return ExecuteRegistryOperation(
            operationName: "Game.RequestRedo",
            operation: () => registry.RequestRedo(gameId, playerId));
    }

    public ErrorOr<GameInstance> RespondToRedo(string gameId, string playerId, string requestId, bool accepted)
    {
        if (string.IsNullOrWhiteSpace(playerId))
        {
            return Error.Validation(
                code: "Game.RespondToRedo.InvalidRequest",
                description: "A player id is required.");
        }

        if (string.IsNullOrWhiteSpace(requestId))
        {
            return Error.Validation(
                code: "Game.RespondToRedo.InvalidRequest",
                description: "A redo request id is required.");
        }

        return ExecuteRegistryOperation(
            operationName: "Game.RespondToRedo",
            operation: () => registry.RespondToRedo(gameId, playerId, requestId, accepted));
    }

    public ErrorOr<GameInstance> CancelRedo(string gameId, string playerId)
    {
        if (string.IsNullOrWhiteSpace(playerId))
        {
            return Error.Validation(
                code: "Game.CancelRedo.InvalidRequest",
                description: "A player id is required.");
        }

        return ExecuteRegistryOperation(
            operationName: "Game.CancelRedo",
            operation: () => registry.CancelRedo(gameId, playerId));
    }

    public ErrorOr<GameInstance> ReleaseRedoRequest(string gameId, string playerId)
    {
        if (string.IsNullOrWhiteSpace(playerId))
        {
            return Error.Validation(
                code: "Game.ReleaseRedoRequest.InvalidRequest",
                description: "A player id is required.");
        }

        return ExecuteRegistryOperation(
            operationName: "Game.ReleaseRedoRequest",
            operation: () => registry.ReleaseRedoRequest(gameId, playerId));
    }

    private ErrorOr<GameInstance> ExecuteRegistryOperation(string operationName, Func<GameInstance> operation)
    {
        try
        {
            return operation();
        }
        catch (KeyNotFoundException ex)
        {
            logger.LogWarning(ex, "Game operation {Operation} failed: game was not found.", operationName);
            return Error.NotFound(code: $"{operationName}.NotFound", description: ex.Message);
        }
        catch (ArgumentException ex)
        {
            logger.LogWarning(ex, "Game operation {Operation} failed: invalid request.", operationName);
            return Error.Validation(code: $"{operationName}.InvalidRequest", description: ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            logger.LogWarning(ex, "Game operation {Operation} failed: invalid game state.", operationName);
            return Error.Validation(code: $"{operationName}.InvalidState", description: ex.Message);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Game operation {Operation} failed unexpectedly.", operationName);
            return Error.Unexpected(code: $"{operationName}.Unexpected", description: ex.Message);
        }
    }
}
