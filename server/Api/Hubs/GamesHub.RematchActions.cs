namespace ProjectHiddenVillage.Server.Api.Hubs;

/// <summary>
/// Agreeing on another match. The table is already over, so these are not board actions and they cannot go through
/// the gate that refuses mutations on a running table - they follow the redo handshake in having their own path.
///
/// A successful agreement reserves a table, and its code travels to both players in the state payload the hub
/// already invalidates on this call (see GameStateResponse.PendingRematch). From there each player goes to the login
/// view, picks the deck they want to bring to the next match, and claims a seat by joining that code.
/// </summary>
public sealed partial class GamesHub
{
    public async Task<HubOperationResult<GameStateResponse>> RequestRematch(string gameId)
    {
        return await ExecuteParticipantOperation(
            gameId,
            operationName: "Game.RequestRematch",
            operation: playerId => gameRematchHandlingService.RequestRematch(NormalizeGameId(gameId), playerId));
    }

    public async Task<HubOperationResult<GameStateResponse>> AcceptRematch(string gameId)
    {
        return await ExecuteParticipantOperation(
            gameId,
            operationName: "Game.AcceptRematch",
            operation: playerId => gameRematchHandlingService.AcceptRematch(NormalizeGameId(gameId), playerId));
    }

    public async Task<HubOperationResult<GameStateResponse>> DeclineRematch(string gameId)
    {
        return await ExecuteParticipantOperation(
            gameId,
            operationName: "Game.DeclineRematch",
            operation: playerId => gameRematchHandlingService.DeclineRematch(NormalizeGameId(gameId), playerId));
    }
}
