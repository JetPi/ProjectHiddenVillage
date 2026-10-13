namespace ProjectHiddenVillage.Server.Api.Interfaces.Game;

/// <summary>
/// Tells a game's clients that the authoritative state changed, so they pull it again.
///
/// The hub already does this for every mutation it handles, but the phase automation can also change the state
/// with nobody calling in - the presentation acknowledgement <em>timeout</em> is exactly that case - and those
/// changes still have to reach the board. This interface is the seam that keeps the engine from depending on
/// SignalR (and on the hub type) directly.
/// </summary>
public interface IGameStateBroadcaster
{
    Task NotifyGameStateInvalidatedAsync(string gameId);
}
