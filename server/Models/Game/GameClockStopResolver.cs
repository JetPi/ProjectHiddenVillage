using ProjectHiddenVillage.Server.Api.Services.Games;
using ProjectHiddenVillage.Server.Engine;
using ProjectHiddenVillage.Server.Engine.Interfaces;

namespace ProjectHiddenVillage.Server;

/// <summary>
/// Answers "who does the engine owe an answer from right now" for the action clock. It reads the same live state
/// the phase automation and the response mapper read, so the clock can never run for a player the board is not
/// asking, and it stops on exactly the states that ask nobody:
///
/// <list type="bullet">
/// <item>the game is over - there is nothing left to answer;</item>
/// <item>a phase presentation is outstanding - the engine is waiting on client acknowledgements, not a player;</item>
/// <item>the current phase is one the engine walks itself - a system step has no budget;</item>
/// <item>the second player has not joined yet.</item>
/// </list>
///
/// Everything else has an owner: a pending prompt is answered by the player it was raised for, a reaction window
/// by the priority player, an action step by the priority player, and the main phase by the active player.
/// </summary>
public static class GameClockStopResolver
{
    private static readonly IGamePhaseStateService PhaseStateService = new GamePhaseStateService();

    public static GameClockStop Resolve(GameInstance instance)
    {
        ArgumentNullException.ThrowIfNull(instance);

        return Resolve(instance, PhaseStateService);
    }

    public static GameClockStop Resolve(GameInstance instance, IGamePhaseStateService phaseStateService)
    {
        ArgumentNullException.ThrowIfNull(instance);
        ArgumentNullException.ThrowIfNull(phaseStateService);

        var state = instance.State;

        if (GameEndRules.IsGameOver(state))
        {
            return GameClockStop.None;
        }

        // The engine stopped on a transition it wants the clients to present. Nobody owes a decision while its own
        // acknowledgement watchdog is running, and charging that wait to a player would punish an animation.
        if (instance.PendingPhasePresentation is not null)
        {
            return GameClockStop.None;
        }

        if (state.Players.Count < 2)
        {
            return GameClockStop.None;
        }

        if (instance.GetPendingPrompt() is { } prompt)
        {
            return new GameClockStop(prompt.RequestedPlayerId, GameClockStopKind.OtherStep);
        }

        // An open support reaction window is a decision, even in a phase the engine otherwise owns.
        if (SupportTimingRules.HasPendingSupportActivation(state))
        {
            return new GameClockStop(ResolvePriorityPlayer(state), GameClockStopKind.OtherStep);
        }

        if (phaseStateService.GetPhaseData(state.Phase).ShouldAutoAdvance)
        {
            // The engine is mid-step: the drain will reach an interactive phase on its own, and those phases carry
            // no budget at all.
            return GameClockStop.None;
        }

        return state.Phase switch
        {
            GamePhase.MainPhase => new GameClockStop(state.ActivePlayerId, GameClockStopKind.MainPhase),
            GamePhase.ActionStep => new GameClockStop(ResolvePriorityPlayer(state), GameClockStopKind.OtherStep),
            // AttackDeclaration (the optional On Attack choice) is answered by the attacker, like its main phase.
            _ => new GameClockStop(state.ActivePlayerId, GameClockStopKind.OtherStep)
        };
    }

    /// <summary>Priority is only meaningful once it is set; before that the active player answers for the stop.</summary>
    private static string ResolvePriorityPlayer(GameState state)
    {
        return string.IsNullOrWhiteSpace(state.PriorityPlayerId) ? state.ActivePlayerId : state.PriorityPlayerId;
    }
}
