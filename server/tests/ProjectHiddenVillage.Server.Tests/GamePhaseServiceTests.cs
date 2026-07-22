using ProjectHiddenVillage.Server;
using ProjectHiddenVillage.Server.Engine;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class GamePhaseServiceTests
{
    private readonly GamePhaseService service = new();

    [TestMethod]
    public void GetNextPhase_UsesExpectedDefaultOrder()
    {
        Assert.AreEqual(GamePhase.Draw, service.GetNextPhase(GamePhase.StartOfMainPhase));
        Assert.AreEqual(GamePhase.SetResource, service.GetNextPhase(GamePhase.Draw));
        Assert.AreEqual(GamePhase.MainPhase, service.GetNextPhase(GamePhase.SetResource));
        Assert.AreEqual(GamePhase.AttackDeclaration, service.GetNextPhase(GamePhase.MainPhase));
        Assert.AreEqual(GamePhase.BlockerDeclaration, service.GetNextPhase(GamePhase.AttackDeclaration));
        Assert.AreEqual(GamePhase.ActionStep, service.GetNextPhase(GamePhase.BlockerDeclaration));
        Assert.AreEqual(GamePhase.AttackResolution, service.GetNextPhase(GamePhase.ActionStep));
        Assert.AreEqual(GamePhase.BattleEndStep, service.GetNextPhase(GamePhase.AttackResolution));
        Assert.AreEqual(GamePhase.MainPhase, service.GetNextPhase(GamePhase.BattleEndStep));
        Assert.AreEqual(GamePhase.StartOfMainPhase, service.GetNextPhase(GamePhase.EndStep));
    }

    [TestMethod]
    public void AdvancePhase_Throws_WhenCalledOnEndStep()
    {
        var state = CreateState(phase: GamePhase.EndStep);

        var ex = Assert.ThrowsException<InvalidOperationException>(() => service.AdvancePhase(state));
        Assert.AreEqual("Use CompleteEndStep to advance from EndStep.", ex.Message);
    }

    [TestMethod]
    public void AdvancePhase_InitializesActionStepPriority_WhenEnteringActionStep()
    {
        var state = CreateState(phase: GamePhase.BlockerDeclaration);
        state.PriorityPlayerId = "p2";
        state.ConsecutivePasses = 1;

        service.AdvancePhase(state);

        Assert.AreEqual(GamePhase.ActionStep, state.Phase);
        Assert.AreEqual("p1", state.PriorityPlayerId);
        Assert.AreEqual(0, state.ConsecutivePasses);
    }

    [TestMethod]
    public void DeclarePassInActionStep_RequiresPriorityPlayer()
    {
        var state = CreateState(phase: GamePhase.ActionStep);
        state.PriorityPlayerId = "p1";

        var ex = Assert.ThrowsException<InvalidOperationException>(() => service.DeclarePassInActionStep(state, "p2"));
        Assert.AreEqual("Only the priority player can declare pass.", ex.Message);
    }

    [TestMethod]
    public void DeclarePassInActionStep_FirstPass_SwapsPriority()
    {
        var state = CreateState(phase: GamePhase.ActionStep);
        state.PriorityPlayerId = "p1";

        var advancedToResolution = service.DeclarePassInActionStep(state, "p1");

        Assert.IsFalse(advancedToResolution);
        Assert.AreEqual("p2", state.PriorityPlayerId);
        Assert.AreEqual(1, state.ConsecutivePasses);
        Assert.AreEqual(GamePhase.ActionStep, state.Phase);
    }

    [TestMethod]
    public void DeclarePassInActionStep_TwoPasses_AdvancesToAttackResolution()
    {
        var state = CreateState(phase: GamePhase.ActionStep);
        state.PriorityPlayerId = "p1";

        service.DeclarePassInActionStep(state, "p1");
        var advancedToResolution = service.DeclarePassInActionStep(state, "p2");

        Assert.IsTrue(advancedToResolution);
        Assert.AreEqual(GamePhase.AttackResolution, state.Phase);
        Assert.AreEqual(string.Empty, state.PriorityPlayerId);
        Assert.AreEqual(0, state.ConsecutivePasses);
    }

    [TestMethod]
    public void DeclareActionInActionStep_ResetsPasses_AndSwapsPriority()
    {
        var state = CreateState(phase: GamePhase.ActionStep);
        state.PriorityPlayerId = "p1";
        state.ConsecutivePasses = 1;

        service.DeclareActionInActionStep(state, "p1");

        Assert.AreEqual(0, state.ConsecutivePasses);
        Assert.AreEqual("p2", state.PriorityPlayerId);
        Assert.AreEqual(GamePhase.ActionStep, state.Phase);
    }

    [TestMethod]
    public void CompleteEndStep_AdvancesTurn_ChangesActivePlayer_AndResetsRoundState()
    {
        var state = CreateState(phase: GamePhase.EndStep);
        state.PriorityPlayerId = "p2";
        state.ConsecutivePasses = 1;

        var wrapped = service.CompleteEndStep(state);

        Assert.IsTrue(wrapped);
        Assert.AreEqual(2, state.TurnNumber);
        Assert.AreEqual("p2", state.ActivePlayerId);
        Assert.AreEqual(GamePhase.StartOfMainPhase, state.Phase);
        Assert.AreEqual(string.Empty, state.PriorityPlayerId);
        Assert.AreEqual(0, state.ConsecutivePasses);
    }

    [TestMethod]
    public void AdvancePhase_AppliesSkipDirective_WhenNextPhaseMatches()
    {
        var state = CreateState(phase: GamePhase.Draw);
        service.EnqueueSkipPhase(state, GamePhase.SetResource);

        service.AdvancePhase(state);

        Assert.AreEqual(GamePhase.MainPhase, state.Phase);
        Assert.AreEqual(0, state.PhaseDirectives.Count);
    }

    [TestMethod]
    public void AdvancePhase_LeavesSkipDirectiveQueued_WhenNextPhaseDoesNotMatch()
    {
        var state = CreateState(phase: GamePhase.Draw);
        service.EnqueueSkipPhase(state, GamePhase.MainPhase);

        service.AdvancePhase(state);

        Assert.AreEqual(GamePhase.SetResource, state.Phase);
        Assert.AreEqual(1, state.PhaseDirectives.Count);
    }

    [TestMethod]
    public void AdvancePhase_AppliesJumpDirective()
    {
        var state = CreateState(phase: GamePhase.Draw);
        service.EnqueueJumpToPhase(state, GamePhase.ActionStep);

        service.AdvancePhase(state);

        Assert.AreEqual(GamePhase.ActionStep, state.Phase);
        Assert.AreEqual("p1", state.PriorityPlayerId);
        Assert.AreEqual(0, state.ConsecutivePasses);
        Assert.AreEqual(0, state.PhaseDirectives.Count);
    }

    [TestMethod]
    public void AdvancePhase_AppliesDirectivesInQueueOrder()
    {
        var state = CreateState(phase: GamePhase.Draw);
        service.EnqueueJumpToPhase(state, GamePhase.MainPhase);
        service.EnqueueSkipPhase(state, GamePhase.AttackDeclaration);

        service.AdvancePhase(state);

        Assert.AreEqual(GamePhase.MainPhase, state.Phase);
        Assert.AreEqual(1, state.PhaseDirectives.Count);
    }

    [TestMethod]
    public void AdvancePhase_UsesInsertedPhaseBeforeDefaultFlow()
    {
        var state = CreateState(phase: GamePhase.Draw);
        state.InsertPhase(GamePhase.BlockerDeclaration);

        service.AdvancePhase(state);

        Assert.AreEqual(GamePhase.BlockerDeclaration, state.Phase);
        Assert.AreEqual(0, state.InsertedPhases.Count);
    }

    [TestMethod]
    public void AdvancePhase_UsesInsertedPhaseBeforeDirectives()
    {
        var state = CreateState(phase: GamePhase.Draw);
        service.EnqueueJumpToPhase(state, GamePhase.MainPhase);
        state.InsertPhase(GamePhase.SetResource);

        service.AdvancePhase(state);

        Assert.AreEqual(GamePhase.SetResource, state.Phase);
        Assert.AreEqual(1, state.PhaseDirectives.Count);
    }

    private static GameState CreateState(GamePhase phase)
    {
        return new GameState
        {
            Phase = phase,
            ActivePlayerId = "p1",
            Players =
            [
                new PlayerState { PlayerId = "p1" },
                new PlayerState { PlayerId = "p2" }
            ]
        };
    }
}