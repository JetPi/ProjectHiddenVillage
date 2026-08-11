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

        var gameResult = GetAuthorizedGameInstance(gameId, requesterIdResult.Value);
        if (gameResult.IsError)
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
}
