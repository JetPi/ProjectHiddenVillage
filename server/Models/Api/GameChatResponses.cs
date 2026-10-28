namespace ProjectHiddenVillage.Server;

/// <summary>The only thing a client may send: the text. Author and time are decided by the server.</summary>
public sealed record GameChatSendRequest(string? Text);

public sealed record GameChatMessageResponse(
    long Sequence,
    string MessageId,
    string SenderPlayerId,
    DateTimeOffset SentAtUtc,
    string Text);

public sealed record GameChatHistoryResponse(
    string GameId,
    long LatestSequence,
    IReadOnlyList<GameChatMessageResponse> Messages);
