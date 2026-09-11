namespace ProjectHiddenVillage.Server.Api.Hubs;

public sealed partial class GamesHub
{
    public async Task<HubOperationResult<GameStateResponse>> ResolvePrompt(string gameId, ResolvePromptRequest request)
    {
        return await ExecuteAuthorizedGameMutation(
            gameId,
            operationName: "Game.ResolvePrompt",
            operation: () => gamePhaseHandlingService.ResolvePrompt(gameId, request));
    }

    public async Task<HubOperationResult<GameStateResponse>> AdvancePhase(string gameId)
    {
        return await ExecuteAuthorizedGameMutation(
            gameId,
            operationName: "Game.AdvancePhase",
            operation: () => gamePhaseHandlingService.AdvancePhase(gameId));
    }

    public async Task<HubOperationResult<GameStateResponse>> DeclarePassInActionStep(string gameId, PlayerPhaseActionRequest request)
    {
        return await ExecuteAuthorizedGameMutation(
            gameId,
            operationName: "Game.DeclarePassInActionStep",
            operation: () => gamePhaseHandlingService.DeclarePassInActionStep(gameId, request));
    }

    public async Task<HubOperationResult<GameStateResponse>> DeclareActionInActionStep(string gameId, PlayerPhaseActionRequest request)
    {
        return await ExecuteAuthorizedGameMutation(
            gameId,
            operationName: "Game.DeclareActionInActionStep",
            operation: () => gamePhaseHandlingService.DeclareActionInActionStep(gameId, request));
    }

    public async Task<HubOperationResult<GameStateResponse>> ExecuteCardAction(string gameId, GameCardActionExecutionRequest request)
    {
        return await ExecuteAuthorizedGameMutation(
            gameId,
            operationName: "Game.ExecuteCardAction",
            operation: () => gamePhaseHandlingService.ExecuteCardAction(gameId, request));
    }

    public Task<HubOperationResult<GameCardActionTargetsResponse>> GetCardActionTargets(string gameId, GameCardActionTargetsRequest request)
    {
        var requesterIdResult = GetRequestingPlayerId();
        if (requesterIdResult.IsError)
        {
            return Task.FromResult(HubOperationResult<GameCardActionTargetsResponse>.FromErrors(requesterIdResult.Errors));
        }

        var gameResult = GetAuthorizedGameInstance(gameId, requesterIdResult.Value);
        if (gameResult.IsError)
        {
            return Task.FromResult(HubOperationResult<GameCardActionTargetsResponse>.FromErrors(gameResult.Errors));
        }

        var result = gamePhaseHandlingService.GetCardActionTargets(gameId, request);
        if (result.IsError)
        {
            return Task.FromResult(HubOperationResult<GameCardActionTargetsResponse>.FromErrors(result.Errors));
        }

        return Task.FromResult(HubOperationResult<GameCardActionTargetsResponse>.Success(result.Value));
    }

    public async Task<HubOperationResult<GameStateResponse>> DeclareEndStep(string gameId)
    {
        return await ExecuteAuthorizedGameMutation(
            gameId,
            operationName: "Game.DeclareEndStep",
            operation: () => gamePhaseHandlingService.DeclareEndStep(gameId));
    }

    public async Task<HubOperationResult<GameStateResponse>> CompleteEndStep(string gameId)
    {
        return await ExecuteAuthorizedGameMutation(
            gameId,
            operationName: "Game.CompleteEndStep",
            operation: () => gamePhaseHandlingService.CompleteEndStep(gameId));
    }
}
