using Microsoft.AspNetCore.SignalR;
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

        await NotifyPresenceChangedAsync(normalizedGameId);
    }

    public async Task UnsubscribeFromGame(string gameId)
    {
        if (string.IsNullOrWhiteSpace(gameId))
        {
            return;
        }

        var normalizedGameId = NormalizeGameId(gameId);
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, normalizedGameId);

        var watchedGames = gamePresenceTracker.RemoveConnection(Context.ConnectionId);
        ReleasePendingRequirementsForConnection(watchedGames);

        if (watchedGames.Any(address => string.Equals(address.GameId, normalizedGameId, StringComparison.Ordinal)))
        {
            await NotifyPresenceChangedAsync(normalizedGameId);
        }
    }

    /// <summary>
    /// A closed tab must stop counting as a watcher: otherwise a presentation minted while it was connected
    /// would wait for an acknowledgement that can never arrive, and the opponent would keep offering a rematch to
    /// somebody who is gone.
    /// </summary>
    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var watchedGames = gamePresenceTracker.RemoveConnection(Context.ConnectionId);
        ReleasePendingRequirementsForConnection(watchedGames);

        foreach (var gameId in watchedGames
            .Select(address => address.GameId)
            .Distinct(StringComparer.Ordinal))
        {
            await NotifyPresenceChangedAsync(gameId);
        }

        await base.OnDisconnectedAsync(exception);
    }

    /// <summary>
    /// Who is watching a board is part of the state the finished board reads - it decides whether the rematch offer
    /// can be made at all - so a watcher arriving or leaving is announced the way a mutation is: the clients refetch
    /// instead of guessing, and the grace the answer carries keeps a refresh from graying the offer out.
    /// </summary>
    private Task NotifyPresenceChangedAsync(string normalizedGameId)
    {
        return Clients.Group(normalizedGameId).SendAsync("GameStateInvalidated", normalizedGameId);
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
