using ErrorOr;

namespace ProjectHiddenVillage.Server.Api.Interfaces.Game;

/// <summary>
/// Taking a move back: one player asks, the other agrees, and the board returns to the last moment either of them
/// was in control. These calls are not board actions, so they do not go through the gate that refuses mutations
/// while a presentation or another redo request is outstanding.
/// </summary>
public interface IGameRedoHandlingService
{
    ErrorOr<GameInstance> RequestRedo(string gameId, string playerId);

    ErrorOr<GameInstance> RespondToRedo(string gameId, string playerId, string requestId, bool accepted);

    ErrorOr<GameInstance> CancelRedo(string gameId, string playerId);

    /// <summary>Drops a request nobody can answer any more, because the player it waited on disconnected.</summary>
    ErrorOr<GameInstance> ReleaseRedoRequest(string gameId, string playerId);
}
