using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Api.Hubs;

public sealed partial class GamesHub
{
    public Task<HubOperationResult<GameStateResponse>> GetCurrentGameState(string gameId)
    {
        var requesterIdResult = GetRequestingPlayerId();
        if (requesterIdResult.IsError)
        {
            return Task.FromResult(HubOperationResult<GameStateResponse>.FromErrors(requesterIdResult.Errors));
        }

        var gameResult = GetAuthorizedGameInstance(gameId, requesterIdResult.Value);
        if (gameResult.IsError)
        {
            return Task.FromResult(HubOperationResult<GameStateResponse>.FromErrors(gameResult.Errors));
        }

        var stateResponse = GameStateResponseMapper.ToGameStateResponse(gameResult.Value.State, requesterIdResult.Value);
        return Task.FromResult(HubOperationResult<GameStateResponse>.Success(stateResponse));
    }
}
