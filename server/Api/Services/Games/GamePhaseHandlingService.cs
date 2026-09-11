using ErrorOr;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using Microsoft.Extensions.Logging;

namespace ProjectHiddenVillage.Server;

public sealed class GamePhaseHandlingService(
    InMemoryGameInstanceRegistry registry,
    IGameSequentialEffectExecutor sequentialEffectExecutor,
    IGameEffectCanExecuteEvaluator canExecuteEvaluator,
    IGameReactiveEffectOrchestrator reactiveEffectOrchestrator,
    ILogger<GamePhaseHandlingService> logger) : IGamePhaseHandlingService
{
    private readonly IGameSequentialEffectExecutor sequentialEffectExecutor = sequentialEffectExecutor;
    private readonly IGameEffectCanExecuteEvaluator canExecuteEvaluator = canExecuteEvaluator;

    public ErrorOr<GameInstance> ResolvePrompt(string gameId, ResolvePromptRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        return ExecuteRegistryOperation(
            operationName: "Game.ResolvePrompt",
            operation: () => registry.ResolvePrompt(gameId, request.RequestedPlayerId, request.SelectedOption, reactiveEffectOrchestrator));
    }

    public ErrorOr<GameInstance> AdvancePhase(string gameId)
    {
        return ExecuteRegistryOperation(
            operationName: "Game.AdvancePhase",
            operation: () => registry.AdvancePhase(gameId, reactiveEffectOrchestrator));
    }

    public ErrorOr<GameInstance> DeclarePassInActionStep(string gameId, PlayerPhaseActionRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        return ExecuteRegistryOperation(
            operationName: "Game.DeclarePassInActionStep",
            operation: () => registry.DeclarePassInActionStep(gameId, request.PlayerId, reactiveEffectOrchestrator));
    }

    public ErrorOr<GameInstance> DeclareActionInActionStep(string gameId, PlayerPhaseActionRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        return ExecuteRegistryOperation(
            operationName: "Game.DeclareActionInActionStep",
            operation: () => registry.DeclareActionInActionStep(gameId, request.PlayerId));
    }

    public ErrorOr<GameInstance> ExecuteCardAction(string gameId, GameCardActionExecutionRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        return ExecuteRegistryOperation(
            operationName: "Game.ExecuteCardAction",
            operation: () => registry.ExecuteCardAction(gameId, request, sequentialEffectExecutor, reactiveEffectOrchestrator));
    }

    public ErrorOr<GameCardActionTargetsResponse> GetCardActionTargets(string gameId, GameCardActionTargetsRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        try
        {
            return registry.GetCardActionTargets(gameId, request, canExecuteEvaluator);
        }
        catch (KeyNotFoundException ex)
        {
            return Error.NotFound(code: "Game.GetCardActionTargets.NotFound", description: ex.Message);
        }
        catch (ArgumentException ex)
        {
            return Error.Validation(code: "Game.GetCardActionTargets.InvalidRequest", description: ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            return Error.Validation(code: "Game.GetCardActionTargets.InvalidState", description: ex.Message);
        }
    }

    public ErrorOr<GameInstance> DeclareEndStep(string gameId)
    {
        return ExecuteRegistryOperation(
            operationName: "Game.DeclareEndStep",
            operation: () => registry.DeclareEndStep(gameId));
    }

    public ErrorOr<GameInstance> CompleteEndStep(string gameId)
    {
        return ExecuteRegistryOperation(
            operationName: "Game.CompleteEndStep",
            operation: () => registry.CompleteEndStep(gameId, reactiveEffectOrchestrator));
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
            // Unexpected failures (for example a NullReferenceException inside a chained effect)
            // would otherwise surface to players as an opaque hub error with no server-side trace.
            logger.LogError(ex, "Game operation {Operation} failed unexpectedly.", operationName);
            return Error.Unexpected(code: $"{operationName}.Unexpected", description: ex.Message);
        }
    }
}