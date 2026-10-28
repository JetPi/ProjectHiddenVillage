using ErrorOr;

namespace ProjectHiddenVillage.Server.Api.Interfaces.Chat;

/// <summary>
/// The chat of every running game, in memory, next to the games themselves.
///
/// Deliberately outside <c>GameInstance</c>: chat must not contend with the per-game lock that serialises the
/// engine's own mutations, and it must not become part of the state the board renders.
/// </summary>
public interface IGameChatStore
{
    /// <summary>
    /// Validates the text, charges the sender's budget and appends the message with its server-assigned sequence,
    /// id and timestamp. Every refusal (empty, too long, rate limited, chat disabled) comes back as an error.
    /// </summary>
    ErrorOr<GameChatMessageResponse> Append(string gameId, string senderPlayerId, string? text);

    /// <summary>
    /// The messages a client has not seen yet, ordered oldest first. <paramref name="sinceSequence"/> of zero
    /// returns the whole retained tail, which is what a fresh board asks for.
    /// </summary>
    GameChatHistoryResponse ReadHistory(string gameId, long sinceSequence);
}
