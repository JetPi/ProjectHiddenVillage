using ProjectHiddenVillage.Server.Api.Interfaces.Game;

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
        // Presence is what the phase presentations wait on, so it is tracked from the moment the board is
        // actually watching the game - not from the connection alone.
        gamePresenceTracker.RegisterConnection(normalizedGameId, requesterIdResult.Value, Context.ConnectionId);
    }

    public async Task UnsubscribeFromGame(string gameId)
    {
        if (string.IsNullOrWhiteSpace(gameId))
        {
            return;
        }

        await Groups.RemoveFromGroupAsync(Context.ConnectionId, NormalizeGameId(gameId));
        ReleasePendingRequirementsForConnection(gamePresenceTracker.RemoveConnection(Context.ConnectionId));
    }

    /// <summary>
    /// A closed tab must stop counting as a watcher: otherwise a presentation minted while it was connected
    /// would wait for an acknowledgement that can never arrive.
    /// </summary>
    public override Task OnDisconnectedAsync(Exception? exception)
    {
        ReleasePendingRequirementsForConnection(gamePresenceTracker.RemoveConnection(Context.ConnectionId));
        return base.OnDisconnectedAsync(exception);
    }

    /// <summary>
    /// Releases a connection that went away from the phase presentations it was expected to acknowledge and from a
    /// redo request it can no longer answer, so a closed tab can never hold the table until a watchdog fires.
    /// </summary>
    private void ReleasePendingRequirementsForConnection(IReadOnlyList<GamePresenceAddress> watchedGames)
    {
        if (watchedGames.Count == 0)
        {
            return;
        }

        var requesterIdResult = GetRequestingPlayerId();
        if (requesterIdResult.IsError)
        {
            return;
        }

        foreach (var address in watchedGames)
        {
            var result = gamePhaseHandlingService.ReleasePhasePresentationRequirement(
                address.GameId,
                requesterIdResult.Value);

            if (result.IsError)
            {
                logger.LogWarning(
                    "Releasing the phase presentation of game {GameId} failed: {ErrorCode} - {ErrorDescription}",
                    address.GameId,
                    result.FirstError.Code,
                    result.FirstError.Description);
            }

            var redoResult = gameRedoHandlingService.ReleaseRedoRequest(address.GameId, requesterIdResult.Value);

            if (redoResult.IsError)
            {
                logger.LogWarning(
                    "Releasing the redo request of game {GameId} failed: {ErrorCode} - {ErrorDescription}",
                    address.GameId,
                    redoResult.FirstError.Code,
                    redoResult.FirstError.Description);
            }
        }
    }
}
