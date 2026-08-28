namespace ProjectHiddenVillage.Server.Api.Hubs;

public sealed partial class GamesHub
{
    public async Task SubscribeToGame(string gameId)
    {
        var requesterIdResult = GetRequestingPlayerId();
        if (requesterIdResult.IsError || string.IsNullOrWhiteSpace(gameId))
        {
            return;
        }

        var normalizedGameId = NormalizeGameId(gameId);
        var gameResult = GetAuthorizedGameInstance(normalizedGameId, requesterIdResult.Value);
        if (gameResult.IsError)
        {
            return;
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, normalizedGameId);
    }

    public async Task UnsubscribeFromGame(string gameId)
    {
        if (string.IsNullOrWhiteSpace(gameId))
        {
            return;
        }

        await Groups.RemoveFromGroupAsync(Context.ConnectionId, NormalizeGameId(gameId));
    }
}
