namespace ProjectHiddenVillage.Server.Api.Interfaces.Game;

/// <summary>One game a connection was watching, as one of its players.</summary>
public readonly record struct GamePresenceAddress(string GameId, string PlayerId);

/// <summary>
/// Who is currently watching each game.
///
/// The phase-presentation contract needs it (see <c>plans/server-owned-phase-transitions.md</c>): a
/// transition the engine performed itself waits for an acknowledgement from every connected participant,
/// and a participant who disconnects mid-presentation must drop out of that requirement instead of
/// stalling the table.
/// </summary>
public interface IGamePresenceTracker
{
    /// <summary>
    /// Registers one connection as watching a game. A player with several tabs is counted once in
    /// <see cref="GetConnectedPlayerIds"/> but every connection has to be removed for them to leave.
    /// </summary>
    void RegisterConnection(string gameId, string playerId, string connectionId);

    /// <summary>
    /// Removes a connection from every game it was watching (a closed tab, an unsubscribe) and reports what it
    /// was watching, so the caller can release anything that was waiting on that client.
    /// </summary>
    IReadOnlyList<GamePresenceAddress> RemoveConnection(string connectionId);

    /// <summary>The players with at least one live connection to the game, ordered for a stable payload.</summary>
    IReadOnlyList<string> GetConnectedPlayerIds(string gameId);

    bool IsPlayerConnected(string gameId, string playerId);
}
