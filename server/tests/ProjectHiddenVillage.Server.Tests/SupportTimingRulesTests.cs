using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class SupportTimingRulesTests
{
    [TestMethod]
    public void IsZoneAllowed_AllowsHandOrigin_OnOwnTurn()
    {
        var state = BuildState(activePlayerId: "p1", priorityPlayerId: "p1");

        Assert.IsTrue(SupportTimingRules.IsZoneAllowed(state, "p1", isFromSupportZone: false));
        Assert.IsTrue(SupportTimingRules.IsZoneAllowed(state, "p1", isFromSupportZone: true));
    }

    [TestMethod]
    public void IsZoneAllowed_RejectsHandOrigin_OnOpponentTurn()
    {
        var state = BuildState(activePlayerId: "p1", priorityPlayerId: "p2");

        Assert.IsFalse(SupportTimingRules.IsZoneAllowed(state, "p2", isFromSupportZone: false));
        Assert.IsTrue(SupportTimingRules.IsZoneAllowed(state, "p2", isFromSupportZone: true));
    }

    [TestMethod]
    public void IsTimingAvailable_AllowsQuickFromHand_DuringOwnMainPhase()
    {
        // [Quick] is playable from hand at any point on your own turn, MainPhase included.
        var state = BuildState(activePlayerId: "p1", priorityPlayerId: "p1", phase: GamePhase.MainPhase);

        Assert.IsTrue(SupportTimingRules.IsTimingAvailable(EffectTiming.Quick, state, "p1", isFromSupportZone: false));
    }

    [TestMethod]
    public void IsTimingAvailable_AllowsDuringYourMainFromHand_DuringOwnMainPhase()
    {
        var state = BuildState(activePlayerId: "p1", priorityPlayerId: "p1", phase: GamePhase.MainPhase);

        Assert.IsTrue(SupportTimingRules.IsTimingAvailable(EffectTiming.DuringYourMain, state, "p1", isFromSupportZone: false));
    }

    [TestMethod]
    public void IsTimingAvailable_AllowsSupportActivated_ReactingToAPendingActivationsMainPhase()
    {
        // [Support Activated] (N-009/N-016) reacts to any support activation, including one made during
        // the MainPhase, so a MainPhase activation opens a reaction window the opponent can answer.
        var state = BuildState(activePlayerId: "p1", priorityPlayerId: "p2", phase: GamePhase.MainPhase);
        AddPendingActivation(state, activatorPlayerId: "p1");

        Assert.IsTrue(SupportTimingRules.IsTimingAvailable(EffectTiming.SupportActivated, state, "p2", isFromSupportZone: true));
        // Hand-origin responses are still illegal on the opponent's turn.
        Assert.IsFalse(SupportTimingRules.IsTimingAvailable(EffectTiming.SupportActivated, state, "p2", isFromSupportZone: false));
        // The player who activated the support cannot react to their own activation.
        state.PriorityPlayerId = "p1";
        Assert.IsFalse(SupportTimingRules.IsTimingAvailable(EffectTiming.SupportActivated, state, "p1", isFromSupportZone: true));
    }

    [TestMethod]
    public void IsTimingAvailable_RejectsSupportActivated_WhenNothingIsAwaitingResponses()
    {
        var state = BuildState(activePlayerId: "p1", priorityPlayerId: "p2", phase: GamePhase.MainPhase);

        Assert.IsFalse(SupportTimingRules.IsTimingAvailable(EffectTiming.SupportActivated, state, "p2", isFromSupportZone: true));

        var cutInState = BuildState(
            activePlayerId: "p1",
            priorityPlayerId: "p2",
            phase: GamePhase.ActionStep,
            hasPendingAttack: true);

        // An attack alone is not a support activation: there is nothing to negate.
        Assert.IsFalse(SupportTimingRules.IsTimingAvailable(EffectTiming.SupportActivated, cutInState, "p2", isFromSupportZone: true));
    }

    [TestMethod]
    public void IsTimingAvailable_AllowsSupportActivated_ForPriorityPlayerInCutInWindow()
    {
        var state = BuildState(
            activePlayerId: "p1",
            priorityPlayerId: "p2",
            phase: GamePhase.ActionStep,
            hasPendingAttack: true);
        AddPendingActivation(state, activatorPlayerId: "p1");

        Assert.IsTrue(SupportTimingRules.IsTimingAvailable(EffectTiming.SupportActivated, state, "p2", isFromSupportZone: true));
        Assert.IsFalse(SupportTimingRules.IsTimingAvailable(EffectTiming.SupportActivated, state, "p2", isFromSupportZone: false));
    }

    [TestMethod]
    public void IsTimingAvailable_AllowsQuickFromSupportZone_ForPriorityPlayerInCutInWindow()
    {
        var state = BuildState(
            activePlayerId: "p1",
            priorityPlayerId: "p2",
            phase: GamePhase.ActionStep,
            hasPendingAttack: true);

        Assert.IsTrue(SupportTimingRules.IsTimingAvailable(EffectTiming.Quick, state, "p2", isFromSupportZone: true));
        Assert.IsFalse(SupportTimingRules.IsTimingAvailable(EffectTiming.Quick, state, "p2", isFromSupportZone: false));
    }

    [TestMethod]
    public void IsTimingAvailable_AllowsDuringOpponentAttack_ForDefenderInCutInWindow()
    {
        var state = BuildState(
            activePlayerId: "p1",
            priorityPlayerId: "p2",
            phase: GamePhase.ActionStep,
            hasPendingAttack: true);

        Assert.IsTrue(SupportTimingRules.IsTimingAvailable(EffectTiming.DuringOpponentAttack, state, "p2", isFromSupportZone: true));
        Assert.IsFalse(SupportTimingRules.IsTimingAvailable(EffectTiming.DuringOpponentAttack, state, "p1", isFromSupportZone: true));
    }

    [TestMethod]
    public void IsTimingAvailable_RejectsDuringOpponentAttack_OnOwnTurnMainPhase()
    {
        var state = BuildState(activePlayerId: "p1", priorityPlayerId: "p1", phase: GamePhase.MainPhase);

        Assert.IsFalse(SupportTimingRules.IsTimingAvailable(EffectTiming.DuringOpponentAttack, state, "p1", isFromSupportZone: false));
    }

    [TestMethod]
    public void IsTimingAvailable_RejectsDuringYourMain_OutsideMainPhase()
    {
        var state = BuildState(
            activePlayerId: "p1",
            priorityPlayerId: "p1",
            phase: GamePhase.ActionStep,
            hasPendingAttack: true);

        Assert.IsFalse(SupportTimingRules.IsTimingAvailable(EffectTiming.DuringYourMain, state, "p1", isFromSupportZone: true));
    }

    [TestMethod]
    public void IsTimingAvailable_RejectsOtherTimings_DuringMainPhaseOfOpponentTurn()
    {
        var state = BuildState(activePlayerId: "p2", priorityPlayerId: "p2", phase: GamePhase.MainPhase);

        Assert.IsFalse(SupportTimingRules.IsTimingAvailable(EffectTiming.Quick, state, "p1", isFromSupportZone: true));
        Assert.IsFalse(SupportTimingRules.IsTimingAvailable(EffectTiming.Unspecified, state, "p1", isFromSupportZone: true));
    }

    private static void AddPendingActivation(GameState state, string activatorPlayerId)
    {
        state.EffectResolutionStack.Add(new EffectResolutionStackEntry
        {
            SourcePlayerId = activatorPlayerId,
            SourceZone = PlayerZone.SupportZone,
            SourceCardInstanceId = "pending-support-1",
            EffectTypeKey = "ChangeValues",
            ActivatedEffectId = "support-effect",
        });
    }

    private static GameState BuildState(
        string activePlayerId,
        string priorityPlayerId,
        GamePhase phase = GamePhase.MainPhase,
        bool hasPendingAttack = false)
    {
        return new GameState
        {
            GameId = "game-support-timing",
            ActivePlayerId = activePlayerId,
            PriorityPlayerId = priorityPlayerId,
            Phase = phase,
            HasPendingAttack = hasPendingAttack,
            Players =
            [
                new PlayerState { PlayerId = "p1" },
                new PlayerState { PlayerId = "p2" },
            ],
        };
    }
}
