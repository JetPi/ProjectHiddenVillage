namespace ProjectHiddenVillage.Server.Api.Hubs;

public sealed partial class GamesHub
{
    public async Task<HubOperationResult<GameStateResponse>> ResolvePrompt(string gameId, ResolvePromptRequest request)
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

        var result = gamePhaseHandlingService.ResolvePrompt(gameId, request);
        return await PublishGameMutationResult(result, requesterIdResult.Value);
    }

    public async Task<HubOperationResult<GameStateResponse>> AdvancePhase(string gameId)
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

        var result = gamePhaseHandlingService.AdvancePhase(gameId);
        return await PublishGameMutationResult(result, requesterIdResult.Value);
    }

    public async Task<HubOperationResult<GameStateResponse>> DeclarePassInActionStep(string gameId, PlayerPhaseActionRequest request)
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

        var result = gamePhaseHandlingService.DeclarePassInActionStep(gameId, request);
        return await PublishGameMutationResult(result, requesterIdResult.Value);
    }

    public async Task<HubOperationResult<GameStateResponse>> DeclareActionInActionStep(string gameId, PlayerPhaseActionRequest request)
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

        var result = gamePhaseHandlingService.DeclareActionInActionStep(gameId, request);
        return await PublishGameMutationResult(result, requesterIdResult.Value);
    }

    public async Task<HubOperationResult<GameStateResponse>> ExecuteCardAction(string gameId, GameCardActionExecutionRequest request)
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

        var result = gamePhaseHandlingService.ExecuteCardAction(gameId, request);
        return await PublishGameMutationResult(result, requesterIdResult.Value);
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

        var result = gamePhaseHandlingService.DeclareEndStep(gameId);
        return await PublishGameMutationResult(result, requesterIdResult.Value);
    }

    public async Task<HubOperationResult<GameStateResponse>> CompleteEndStep(string gameId)
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

        var result = gamePhaseHandlingService.CompleteEndStep(gameId);
        return await PublishGameMutationResult(result, requesterIdResult.Value);
    }
}
