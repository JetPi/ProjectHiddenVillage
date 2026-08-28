using ProjectHiddenVillage.Server;
using ProjectHiddenVillage.Server.Engine;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class GamePhaseServiceTests
{
    private readonly GamePhaseService service = new(new GamePhaseStateService());

    [TestMethod]
    public void GetNextPhase_UsesExpectedDefaultOrder()
    {
        Assert.AreEqual(GamePhase.DrawPhase, service.GetNextPhase(GamePhase.StartOfMainPhase));
        Assert.AreEqual(GamePhase.RefreshPhase, service.GetNextPhase(GamePhase.DrawPhase));
        Assert.AreEqual(GamePhase.MainPhase, service.GetNextPhase(GamePhase.RefreshPhase));
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
        var instance = CreateInstance(phase: GamePhase.EndStep, activePlayerId: "p1");

        var ex = Assert.ThrowsException<InvalidOperationException>(() => service.AdvancePhase(instance));
        Assert.AreEqual("Use CompleteEndStep to advance from EndStep.", ex.Message);
    }

    [TestMethod]
    public void AdvancePhase_InitializesActionStepPriority_WhenEnteringActionStep()
    {
        var instance = CreateInstance(phase: GamePhase.BlockerDeclaration, activePlayerId: "p1", priorityPlayerId: "p2");
        instance.State.ConsecutivePasses = 1;

        service.AdvancePhase(instance);

        Assert.AreEqual(GamePhase.ActionStep, instance.State.Phase);
        Assert.AreEqual("p1", instance.State.PriorityPlayerId);
        Assert.AreEqual(0, instance.State.ConsecutivePasses);
    }

    [TestMethod]
    public void AdvancePhase_LeavingDrawInitialHand_DrawsTopFiveCardsForEachPlayer()
    {
        var instance = CreateInstance(phase: GamePhase.ChooseStartingPlayer, activePlayerId: "p1");

        instance.State.Players[0].Deck.AddRange(CreateDeckCards("p1", "p1-card", 6));
        instance.State.Players[1].Deck.AddRange(CreateDeckCards("p2", "p2-card", 6));

        service.AdvancePhase(instance);
        Assert.AreEqual(GamePhase.DrawInitialHand, instance.State.Phase);

        service.AdvancePhase(instance);

        Assert.AreEqual(GamePhase.Mulligan, instance.State.Phase);
        var mulliganPrompt = instance.GetPendingPrompt();
        Assert.IsNotNull(mulliganPrompt);
        Assert.AreEqual(GamePromptType.Mulligan, mulliganPrompt.Type);
        Assert.AreEqual("p2", mulliganPrompt.RequestedPlayerId);
        CollectionAssert.AreEqual(new[] { "mulligan", "noMulligan" }, mulliganPrompt.Options);
        Assert.AreEqual(1, instance.PendingPrompts.Count);
        Assert.AreEqual(5, instance.State.Players[0].Hand.Count);
        Assert.AreEqual(1, instance.State.Players[0].Deck.Count);
        Assert.AreEqual("p1-card-1", instance.State.Players[0].Hand[0].CardDefinitionId);
        Assert.AreEqual("p1-card-6", instance.State.Players[0].Deck[0].CardDefinitionId);

        Assert.AreEqual(5, instance.State.Players[1].Hand.Count);
        Assert.AreEqual(1, instance.State.Players[1].Deck.Count);
        Assert.AreEqual("p2-card-1", instance.State.Players[1].Hand[0].CardDefinitionId);
        Assert.AreEqual("p2-card-6", instance.State.Players[1].Deck[0].CardDefinitionId);
    }

    [TestMethod]
    public void ResolvePrompt_Mulligan_RedrawsSecondPlayerHand()
    {
        var instance = CreateInstance(phase: GamePhase.ChooseStartingPlayer, activePlayerId: "p1");

        SeedDefinitions(instance.State, "p1-card", 6);
        SeedDefinitions(instance.State, "p2-card", 6);

        instance.State.Players[0].Deck.AddRange(CreateDeckCards("p1", "p1-card", 6));
        instance.State.Players[1].Deck.AddRange(CreateDeckCards("p2", "p2-card", 6));

        service.AdvancePhase(instance);
        service.AdvancePhase(instance);

        var prompt = instance.GetPendingPrompt();
        Assert.IsNotNull(prompt);
        Assert.AreEqual("p2", prompt.RequestedPlayerId);

        var secondPlayer = instance.State.Players[1];
        var originalSecondPlayerCardInstanceIds = secondPlayer.Hand
            .Concat(secondPlayer.Deck)
            .Select(card => card.InstanceId)
            .ToList();

        instance.ResolvePrompt(prompt.RequestedPlayerId, "mulligan");

        Assert.IsNull(instance.GetPendingPrompt());
        Assert.AreEqual(5, secondPlayer.Hand.Count);
        Assert.AreEqual(1, secondPlayer.Deck.Count);
        CollectionAssert.AreEquivalent(
            originalSecondPlayerCardInstanceIds,
            secondPlayer.Hand
                .Concat(secondPlayer.Deck)
                .Select(card => card.InstanceId)
                .ToList());
    }

    [TestMethod]
    public void DeclarePassInActionStep_RequiresPriorityPlayer()
    {
        var instance = CreateInstance(phase: GamePhase.ActionStep, activePlayerId: "p1", priorityPlayerId: "p1");

        var ex = Assert.ThrowsException<InvalidOperationException>(() => service.DeclarePassInActionStep(instance, "p2"));
        Assert.AreEqual("Only the priority player can declare pass.", ex.Message);
    }

    [TestMethod]
    public void DeclarePassInActionStep_FirstPass_SwapsPriority()
    {
        var instance = CreateInstance(phase: GamePhase.ActionStep, activePlayerId: "p1", priorityPlayerId: "p1");

        var advancedToResolution = service.DeclarePassInActionStep(instance, "p1");

        Assert.IsFalse(advancedToResolution);
        Assert.AreEqual("p2", instance.State.PriorityPlayerId);
        Assert.AreEqual(1, instance.State.ConsecutivePasses);
        Assert.AreEqual(GamePhase.ActionStep, instance.State.Phase);
    }

    [TestMethod]
    public void DeclarePassInActionStep_TwoPasses_AdvancesToAttackResolution()
    {
        var instance = CreateInstance(phase: GamePhase.ActionStep, activePlayerId: "p1", priorityPlayerId: "p1");

        service.DeclarePassInActionStep(instance, "p1");
        var advancedToResolution = service.DeclarePassInActionStep(instance, "p2");

        Assert.IsTrue(advancedToResolution);
        Assert.AreEqual(GamePhase.AttackResolution, instance.State.Phase);
        Assert.AreEqual(string.Empty, instance.State.PriorityPlayerId);
        Assert.AreEqual(0, instance.State.ConsecutivePasses);
    }

    [TestMethod]
    public void DeclareActionInActionStep_ResetsPasses_AndSwapsPriority()
    {
        var instance = CreateInstance(phase: GamePhase.ActionStep, activePlayerId: "p1", priorityPlayerId: "p1");
        instance.State.ConsecutivePasses = 1;

        service.DeclareActionInActionStep(instance, "p1");

        Assert.AreEqual(0, instance.State.ConsecutivePasses);
        Assert.AreEqual("p2", instance.State.PriorityPlayerId);
        Assert.AreEqual(GamePhase.ActionStep, instance.State.Phase);
    }

    [TestMethod]
    public void CompleteEndStep_AdvancesTurn_ChangesActivePlayer_AndResetsRoundState()
    {
        var instance = CreateInstance(phase: GamePhase.EndStep, activePlayerId: "p1", priorityPlayerId: "p2");
        instance.State.ConsecutivePasses = 1;

        var wrapped = service.CompleteEndStep(instance);

        Assert.IsTrue(wrapped);
        Assert.AreEqual(2, instance.State.TurnNumber);
        Assert.AreEqual("p2", instance.State.ActivePlayerId);
        Assert.AreEqual(GamePhase.StartOfMainPhase, instance.State.Phase);
        Assert.AreEqual(string.Empty, instance.State.PriorityPlayerId);
        Assert.AreEqual(0, instance.State.ConsecutivePasses);
    }

    [TestMethod]
    public void AdvancePhase_AppliesSkipDirective_WhenNextPhaseMatches()
    {
        var instance = CreateInstance(phase: GamePhase.DrawPhase, activePlayerId: "p1");
        service.EnqueueSkipPhase(instance, GamePhase.RefreshPhase);

        service.AdvancePhase(instance);

        Assert.AreEqual(GamePhase.MainPhase, instance.State.Phase);
        Assert.AreEqual(0, instance.State.PhaseDirectives.Count);
    }

    [TestMethod]
    public void AdvancePhase_LeavesSkipDirectiveQueued_WhenNextPhaseDoesNotMatch()
    {
        var instance = CreateInstance(phase: GamePhase.DrawPhase, activePlayerId: "p1");
        service.EnqueueSkipPhase(instance, GamePhase.MainPhase);

        service.AdvancePhase(instance);

        Assert.AreEqual(GamePhase.RefreshPhase, instance.State.Phase);
        Assert.AreEqual(1, instance.State.PhaseDirectives.Count);
    }

    [TestMethod]
    public void AdvancePhase_AppliesJumpDirective()
    {
        var instance = CreateInstance(phase: GamePhase.DrawPhase, activePlayerId: "p1");
        service.EnqueueJumpToPhase(instance, GamePhase.ActionStep);

        service.AdvancePhase(instance);

        Assert.AreEqual(GamePhase.ActionStep, instance.State.Phase);
        Assert.AreEqual("p1", instance.State.PriorityPlayerId);
        Assert.AreEqual(0, instance.State.ConsecutivePasses);
        Assert.AreEqual(0, instance.State.PhaseDirectives.Count);
    }

    [TestMethod]
    public void AdvancePhase_AppliesDirectivesInQueueOrder()
    {
        var instance = CreateInstance(phase: GamePhase.DrawPhase, activePlayerId: "p1");
        service.EnqueueJumpToPhase(instance, GamePhase.MainPhase);
        service.EnqueueSkipPhase(instance, GamePhase.AttackDeclaration);

        service.AdvancePhase(instance);

        Assert.AreEqual(GamePhase.MainPhase, instance.State.Phase);
        Assert.AreEqual(1, instance.State.PhaseDirectives.Count);
    }

    [TestMethod]
    public void AdvancePhase_UsesInsertedPhaseBeforeDefaultFlow()
    {
        var instance = CreateInstance(phase: GamePhase.DrawPhase, activePlayerId: "p1");
        instance.State.InsertPhase(GamePhase.BlockerDeclaration);

        service.AdvancePhase(instance);

        Assert.AreEqual(GamePhase.BlockerDeclaration, instance.State.Phase);
        Assert.AreEqual(0, instance.State.InsertedPhases.Count);
    }

    [TestMethod]
    public void AdvancePhase_UsesInsertedPhaseBeforeDirectives()
    {
        var instance = CreateInstance(phase: GamePhase.DrawPhase, activePlayerId: "p1");
        service.EnqueueJumpToPhase(instance, GamePhase.MainPhase);
        instance.State.InsertPhase(GamePhase.RefreshPhase);

        service.AdvancePhase(instance);

        Assert.AreEqual(GamePhase.RefreshPhase, instance.State.Phase);
        Assert.AreEqual(1, instance.State.PhaseDirectives.Count);
    }

    [TestMethod]
    public void AdvancePhase_GameInstanceOverload_WritesPhaseStartedLog()
    {
        var instance = CreateInstance(phase: GamePhase.StartOfMainPhase, activePlayerId: "p1");

        service.AdvancePhase(instance);

        Assert.AreEqual(GamePhase.DrawPhase, instance.State.Phase);
        var entry = instance.ActionLog.Last();
        Assert.AreEqual("phase_started", entry.ActionType);
        Assert.AreEqual("p1", entry.PlayerId);
        Assert.AreEqual("StartOfMainPhase", entry.Metadata["fromPhase"]);
        Assert.AreEqual("DrawPhase", entry.Metadata["toPhase"]);
    }

    [TestMethod]
    public void AdvancePhase_EnteringRefreshPhase_ReadiesOnlyActivePlayerBattlefieldCards()
    {
        var instance = CreateInstance(phase: GamePhase.DrawPhase, activePlayerId: "p1");

        instance.State.Players[0].Battlefield.Add(new CardInstance
        {
            InstanceId = "p1-rested",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
            IsRested = true
        });

        instance.State.Players[1].Battlefield.Add(new CardInstance
        {
            InstanceId = "p2-rested",
            CardDefinitionId = "card-2",
            OwnerPlayerId = "p2",
            ControllerPlayerId = "p2",
            IsRested = true
        });

        service.AdvancePhase(instance);

        Assert.AreEqual(GamePhase.RefreshPhase, instance.State.Phase);
        Assert.IsFalse(instance.State.Players[0].Battlefield[0].IsRested);
        Assert.IsTrue(instance.State.Players[1].Battlefield[0].IsRested);
    }

    [TestMethod]
    public void DeclarePassInActionStep_GameInstanceOverload_WritesPassLog()
    {
        var instance = CreateInstance(phase: GamePhase.ActionStep, activePlayerId: "p1", priorityPlayerId: "p1");

        service.DeclarePassInActionStep(instance, "p1");

        var entry = instance.ActionLog.Last();
        Assert.AreEqual("action_step_pass_declared", entry.ActionType);
        Assert.AreEqual("p1", entry.PlayerId);
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

    private static GameInstance CreateInstance(GamePhase phase, string activePlayerId, string priorityPlayerId = "")
    {
        var state = CreateState(phase);
        state.ActivePlayerId = activePlayerId;
        state.PriorityPlayerId = priorityPlayerId;

        return new GameInstance(state);
    }

    private static List<CardInstance> CreateDeckCards(string playerId, string cardPrefix, int count)
    {
        var cards = new List<CardInstance>(capacity: count);

        for (var index = 1; index <= count; index++)
        {
            cards.Add(new CardInstance
            {
                CardDefinitionId = $"{cardPrefix}-{index}",
                OwnerPlayerId = playerId,
                ControllerPlayerId = playerId
            });
        }

        return cards;
    }

    private static void SeedDefinitions(GameState state, string cardPrefix, int count)
    {
        for (var index = 1; index <= count; index++)
        {
            var definitionId = $"{cardPrefix}-{index}";
            state.CardDefinitions[definitionId] = new Card
            {
                Id = definitionId,
                DisplayName = definitionId,
                Name = [definitionId],
                Type = CardType.Character,
                Description = string.Empty,
                Traits = [],
                Conditions = [],
                Effects = []
            };
        }
    }
}