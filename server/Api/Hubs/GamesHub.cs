using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using ErrorOr;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Api.Hubs;

[Authorize]
public sealed class GamesHub(
    IGameInstanceService gameInstanceService,
    IGamePhaseHandlingService gamePhaseHandlingService,
    IGameReadService gameReadService) : Hub
{
    public async Task<HubOperationResult<GameStateResponse>> CreateGame(CreateGameForUserRequest request, string? preferredGameCode = null)
    {
        var requesterIdResult = GetRequestingPlayerId();
        if (requesterIdResult.IsError)
        {
            return HubOperationResult<GameStateResponse>.FromErrors(requesterIdResult.Errors);
        }

        if (request.UserId.ToString("N") != requesterIdResult.Value)
        {
            return HubOperationResult<GameStateResponse>.Failure(
                code: "Game.CreateForUser.Forbidden",
                description: "Authenticated user does not match requested user.");
        }

        var createResult = await gameInstanceService.CreateGameForUser(request, preferredGameCode);
        if (createResult.IsError)
        {
            return HubOperationResult<GameStateResponse>.FromErrors(createResult.Errors);
        }

        var gameId = createResult.Value.Id;
        await Groups.AddToGroupAsync(Context.ConnectionId, gameId);

        var stateResponse = GameStateResponseMapper.ToGameStateResponse(createResult.Value.State, requesterIdResult.Value);
        await Clients.Group(gameId).SendAsync("GameStateInvalidated", gameId);

        return HubOperationResult<GameStateResponse>.Success(stateResponse);
    }

    public async Task<HubOperationResult<GameStateResponse>> JoinGame(string gameId, JoinGameAsPlayer request)
    {
        var requesterIdResult = GetRequestingPlayerId();
        if (requesterIdResult.IsError)
        {
            return HubOperationResult<GameStateResponse>.FromErrors(requesterIdResult.Errors);
        }

        if (request.UserId.ToString("N") != requesterIdResult.Value)
        {
            return HubOperationResult<GameStateResponse>.Failure(
                code: "Game.JoinForUser.Forbidden",
                description: "Authenticated user does not match requested user.");
        }

        var joinResult = await gameInstanceService.JoinGameForUser(gameId, request);
        if (joinResult.IsError)
        {
            return HubOperationResult<GameStateResponse>.FromErrors(joinResult.Errors);
        }

        var normalizedGameId = joinResult.Value.Id;
        await Groups.AddToGroupAsync(Context.ConnectionId, normalizedGameId);

        var stateResponse = GameStateResponseMapper.ToGameStateResponse(joinResult.Value.State, requesterIdResult.Value);
        await Clients.Group(normalizedGameId).SendAsync("GameStateInvalidated", normalizedGameId);

        return HubOperationResult<GameStateResponse>.Success(stateResponse);
    }

    public async Task<HubOperationResult<GameStateResponse>> ResolvePrompt(string gameId, ResolvePromptRequest request)
    {
        var requesterIdResult = GetRequestingPlayerId();
        if (requesterIdResult.IsError)
        {
            return HubOperationResult<GameStateResponse>.FromErrors(requesterIdResult.Errors);
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

        var result = gamePhaseHandlingService.DeclareActionInActionStep(gameId, request);
        return await PublishGameMutationResult(result, requesterIdResult.Value);
    }

    public async Task<HubOperationResult<GameStateResponse>> DeclareEndStep(string gameId)
    {
        var requesterIdResult = GetRequestingPlayerId();
        if (requesterIdResult.IsError)
        {
            return HubOperationResult<GameStateResponse>.FromErrors(requesterIdResult.Errors);
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

        var result = gamePhaseHandlingService.CompleteEndStep(gameId);
        return await PublishGameMutationResult(result, requesterIdResult.Value);
    }

    public async Task SubscribeToGame(string gameId)
    {
        if (string.IsNullOrWhiteSpace(gameId))
        {
            return;
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, gameId.Trim());
    }

    public async Task UnsubscribeFromGame(string gameId)
    {
        if (string.IsNullOrWhiteSpace(gameId))
        {
            return;
        }

        await Groups.RemoveFromGroupAsync(Context.ConnectionId, gameId.Trim());
    }

    private async Task<HubOperationResult<GameStateResponse>> PublishGameMutationResult(ErrorOr<GameInstance> result, string requestingPlayerId)
    {
        if (result.IsError)
        {
            return HubOperationResult<GameStateResponse>.FromErrors(result.Errors);
        }

        var game = result.Value;
        await Groups.AddToGroupAsync(Context.ConnectionId, game.Id);
        await Clients.Group(game.Id).SendAsync("GameStateInvalidated", game.Id);

        var stateResponse = GameStateResponseMapper.ToGameStateResponse(game.State, requestingPlayerId);
        return HubOperationResult<GameStateResponse>.Success(stateResponse);
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
}

public sealed record HubOperationResult<T>(bool Succeeded, T? Value, string? ErrorCode, string? ErrorDescription)
{
    public static HubOperationResult<T> Success(T value) => new(true, value, null, null);

    public static HubOperationResult<T> Failure(string code, string description) => new(false, default, code, description);

    public static HubOperationResult<T> FromErrors(IReadOnlyList<Error> errors)
    {
        if (errors.Count == 0)
        {
            return Failure("Unknown", "Unknown error.");
        }

        return Failure(errors[0].Code, errors[0].Description);
    }
}
