using ProjectHiddenVillage.Server.Api.Services.Games;
using Microsoft.AspNetCore.SignalR;

namespace ProjectHiddenVillage.Server.Api.Hubs;

public sealed partial class GamesHub
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

        var gameId = NormalizeGameId(createResult.Value.Id);
        await Groups.AddToGroupAsync(Context.ConnectionId, gameId);

        var stateResponse = GameStateResponseMapper.ToGameStateResponse(createResult.Value, requesterIdResult.Value);
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

        var normalizedGameId = NormalizeGameId(joinResult.Value.Id);
        await Groups.AddToGroupAsync(Context.ConnectionId, normalizedGameId);

        var stateResponse = GameStateResponseMapper.ToGameStateResponse(joinResult.Value, requesterIdResult.Value);
        await Clients.Group(normalizedGameId).SendAsync("GameStateInvalidated", normalizedGameId);
        await Clients.Group(normalizedGameId).SendAsync("GameParticipantJoined", normalizedGameId);

        return HubOperationResult<GameStateResponse>.Success(stateResponse);
    }
}
