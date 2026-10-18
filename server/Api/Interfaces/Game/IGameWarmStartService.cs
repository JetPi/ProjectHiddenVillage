using ErrorOr;

namespace ProjectHiddenVillage.Server.Api.Interfaces.Game;

/// <summary>
/// Test-only support: walks a freshly created game through its opening (the starting-player choice, both
/// mulligans and the engine-owned phases) down to the first MainPhase, before any client has connected.
///
/// It exists so an e2e scenario can start where it actually wants to assert, instead of paying the opening
/// prologue - two logins, two page loads, the prompts and a phase walk - in every one of them. The walk is safe
/// with nobody watching: <c>TryMintPresentation</c> mints nothing when the presence tracker knows no connected
/// participant, so the drain needs no acknowledgement round trips.
/// </summary>
public interface IGameWarmStartService
{
    /// <summary>
    /// Resolves the opening for <paramref name="gameCode"/> and returns the state it landed on. The
    /// starting-player prompt is answered so the player at <paramref name="startingPlayerPosition"/> (join order,
    /// zero-based) starts, and both mulligan prompts are answered with "keep the dealt hand".
    /// </summary>
    ErrorOr<GameWarmStartResult> WarmStart(string gameCode, int startingPlayerPosition = 0);
}

/// <summary>Where the warm start left the game: the first MainPhase, with the player who owns it.</summary>
public sealed record GameWarmStartResult(string Id, string Phase, string ActivePlayerId, int TurnNumber);
