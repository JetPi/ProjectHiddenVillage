using Microsoft.AspNetCore.SignalR;
using ProjectHiddenVillage.Server.Api.Services.Chat;

namespace ProjectHiddenVillage.Server.Api.Hubs;

public sealed partial class GamesHub
{
    /// <summary>The clients append the message they receive; nothing about the board is refetched.</summary>
    public const string GameChatMessagePostedEventName = "GameChatMessagePosted";

    /// <summary>
    /// Posts one message to the game's other player. It is deliberately not a game mutation: it takes no game lock,
    /// never publishes <c>GameStateInvalidated</c>, and stays available while the table is parked on a phase
    /// presentation or on a redo request.
    /// </summary>
    public async Task<HubOperationResult<GameChatMessageResponse>> SendGameChatMessage(
        string gameId,
        GameChatSendRequest request)
    {
        var requesterIdResult = GetRequestingPlayerId();
        if (requesterIdResult.IsError)
        {
            return HubOperationResult<GameChatMessageResponse>.FromErrors(requesterIdResult.Errors);
        }

        if (string.IsNullOrWhiteSpace(gameId))
        {
            return HubOperationResult<GameChatMessageResponse>.Failure(
                code: GameChatErrorCodes.MissingGameId,
                description: "Game id is required.");
        }

        var normalizedGameId = NormalizeGameId(gameId);
        var gameResult = GetAuthorizedGameInstance(normalizedGameId, requesterIdResult.Value);
        if (gameResult.IsError)
        {
            return HubOperationResult<GameChatMessageResponse>.FromErrors(gameResult.Errors);
        }

        var messageResult = gameChatStore.Append(normalizedGameId, requesterIdResult.Value, request?.Text);
        if (messageResult.IsError)
        {
            logger.LogWarning(
                "Chat message refused for game {GameId} by player {PlayerId}: {ErrorCode}",
                normalizedGameId,
                requesterIdResult.Value,
                messageResult.FirstError.Code);

            return HubOperationResult<GameChatMessageResponse>.FromErrors(messageResult.Errors);
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, normalizedGameId);
        await Clients
            .Group(normalizedGameId)
            .SendAsync(GameChatMessagePostedEventName, normalizedGameId, messageResult.Value);

        return HubOperationResult<GameChatMessageResponse>.Success(messageResult.Value);
    }

    public Task<HubOperationResult<GameChatHistoryResponse>> GetGameChatHistory(string gameId, long sinceSequence)
    {
        var requesterIdResult = GetRequestingPlayerId();
        if (requesterIdResult.IsError)
        {
            return Task.FromResult(HubOperationResult<GameChatHistoryResponse>.FromErrors(requesterIdResult.Errors));
        }

        if (string.IsNullOrWhiteSpace(gameId))
        {
            return Task.FromResult(HubOperationResult<GameChatHistoryResponse>.Failure(
                code: GameChatErrorCodes.MissingGameId,
                description: "Game id is required."));
        }

        var normalizedGameId = NormalizeGameId(gameId);
        var gameResult = GetAuthorizedGameInstance(normalizedGameId, requesterIdResult.Value);
        if (gameResult.IsError)
        {
            return Task.FromResult(HubOperationResult<GameChatHistoryResponse>.FromErrors(gameResult.Errors));
        }

        var history = gameChatStore.ReadHistory(normalizedGameId, sinceSequence);
        return Task.FromResult(HubOperationResult<GameChatHistoryResponse>.Success(history));
    }
}
