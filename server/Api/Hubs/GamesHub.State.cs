using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Api.Hubs;

public sealed partial class GamesHub
{
    /// <summary>
    /// Maps a game to the state one player sees. Every hub path that answers with a state goes through here, so the
    /// rematch presence rides along without each path having to remember to ask for it.
    /// </summary>
    private GameStateResponse MapGameState(GameInstance game, string requestingPlayerId)
    {
        return GameStateResponseMapper.ToGameStateResponse(
            game,
            requestingPlayerId,
            gameRematchHandlingService.GetOpponentPresenceSecondsRemaining(game.Id, requestingPlayerId));
    }

    public Task<HubOperationResult<GameStateResponse>> GetCurrentGameState(string gameId)
    {
        var requesterIdResult = GetRequestingPlayerId();
        if (requesterIdResult.IsError)
        {
            return Task.FromResult(HubOperationResult<GameStateResponse>.FromErrors(requesterIdResult.Errors));
        }

        var normalizedGameId = NormalizeGameId(gameId);
        var gameResult = GetAuthorizedGameInstance(normalizedGameId, requesterIdResult.Value);
        if (gameResult.IsError)
        {
            return Task.FromResult(HubOperationResult<GameStateResponse>.FromErrors(gameResult.Errors));
        }

        var stateResponse = MapGameState(gameResult.Value, requesterIdResult.Value);
        return Task.FromResult(HubOperationResult<GameStateResponse>.Success(stateResponse));
    }
}
