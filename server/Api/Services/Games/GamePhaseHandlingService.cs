using ErrorOr;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server;

public sealed class GamePhaseHandlingService(InMemoryGameInstanceRegistry registry) : IGamePhaseHandlingService
{
    public ErrorOr<GameInstance> ResolvePrompt(string gameId, ResolvePromptRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        return ExecuteRegistryOperation(
            operationName: "Game.ResolvePrompt",
            operation: () => registry.ResolvePrompt(gameId, request.RequestedPlayerId, request.SelectedOption));
    }

    public ErrorOr<GameInstance> AdvancePhase(string gameId)
    {
        return ExecuteRegistryOperation(
            operationName: "Game.AdvancePhase",
            operation: () => registry.AdvancePhase(gameId));
    }

    public ErrorOr<GameInstance> DeclarePassInActionStep(string gameId, PlayerPhaseActionRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        return ExecuteRegistryOperation(
            operationName: "Game.DeclarePassInActionStep",
            operation: () => registry.DeclarePassInActionStep(gameId, request.PlayerId));
    }

    public ErrorOr<GameInstance> DeclareActionInActionStep(string gameId, PlayerPhaseActionRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        return ExecuteRegistryOperation(
            operationName: "Game.DeclareActionInActionStep",
            operation: () => registry.DeclareActionInActionStep(gameId, request.PlayerId));
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
            operation: () => registry.CompleteEndStep(gameId));
    }

    private static ErrorOr<GameInstance> ExecuteRegistryOperation(string operationName, Func<GameInstance> operation)
    {
        try
        {
            return operation();
        }
        catch (KeyNotFoundException ex)
        {
            return Error.NotFound(code: $"{operationName}.NotFound", description: ex.Message);
        }
        catch (ArgumentException ex)
        {
            return Error.Validation(code: $"{operationName}.InvalidRequest", description: ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            return Error.Validation(code: $"{operationName}.InvalidState", description: ex.Message);
        }
    }
}