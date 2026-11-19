using ErrorOr;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;
using ProjectHiddenVillage.Server.Engine;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// Covers the "[On Summon]" (<see cref="EffectTiming.OnSummon"/>) trigger step of a summon. Every site that
/// puts a character on the field funnels through <see cref="GameTriggeredEffectRunner"/>: the registry's
/// normal summon and requirement (tribute) summon, plus the SummonCard / TributeSummonCard effects. These
/// tests pin the mandatory-only dispatch, the timing filter, the bounded nested-trigger depth, and that a
/// trigger the engine cannot execute is recorded instead of aborting a summon that already happened.
/// </summary>
[TestClass]
public sealed class InMemoryGameInstanceRegistryOnSummonTests
{
    private const string SummonedInstanceId = "summoned-1";
    private const string TriggerEffectId = "onsummon-life";
    private const string TributeMaterialInstanceId = "tribute-material-1";
    private const string TrashRecallInstanceId = "trash-recall-1";
    private const string TrashRecallDefinitionId = "trash-recall-def";
    private const string TrashRecallEffectId = "onsummon-trash-recall";
    private const string RevealDeckInstanceId = "reveal-deck-1";

    private readonly InMemoryGameInstanceRegistry registry = new(
        new GameInstanceFactory(),
        new GamePhaseService(new GamePhaseStateService()));

    [TestMethod]
    public void ExecuteCardAction_NormalSummon_RunsMandatoryOnSummonEffect()
    {
        var game = CreateGame(definitionId: "onsummon-def");

        registry.ExecuteCardAction(game.Id, CreateSummonRequest(), CreateSequentialExecutor());

        Assert.AreEqual(SummonedInstanceId, game.State.Players[0].Battlefield.Single().InstanceId);
        Assert.AreEqual(0, game.State.Players[0].Hand.Count);
        Assert.IsFalse(game.State.IsSummonCardReady("p1"));

        // The mandatory "[On Summon]" effect ran as soon as the card landed: own leader life 4 -> 5.
        Assert.AreEqual(5, game.State.Players[0].LeaderCardInstance!.CurrentLife);
        Assert.AreEqual(0, CountSkippedOnSummonEntries(game));
        Assert.IsNull(game.GetPendingPrompt());
    }

    [TestMethod]
    public void ExecuteCardAction_NormalSummon_DoesNotRunOptionalOnSummonEffect()
    {
        var game = CreateGame(definitionId: "onsummon-def-optional");

        registry.ExecuteCardAction(game.Id, CreateSummonRequest(), CreateSequentialExecutor());

        Assert.AreEqual(SummonedInstanceId, game.State.Players[0].Battlefield.Single().InstanceId);

        // A "may" clause is the player's own decision, so the automatic runner leaves it alone: the leader life
        // is untouched and nothing is parked as a skipped trigger.
        Assert.AreEqual(4, game.State.Players[0].LeaderCardInstance!.CurrentLife);
        Assert.AreEqual(0, CountSkippedOnSummonEntries(game));
        Assert.IsNull(game.GetPendingPrompt());
    }

    [TestMethod]
    public void ExecuteCardAction_NormalSummon_DoesNotRunEffectsOfOtherTimings()
    {
        var game = CreateGame(definitionId: "onsummon-def-when-attacking");

        registry.ExecuteCardAction(game.Id, CreateSummonRequest(), CreateSequentialExecutor());

        Assert.AreEqual(SummonedInstanceId, game.State.Players[0].Battlefield.Single().InstanceId);

        // The card's only effect triggers on attack, so summoning it must not fire anything.
        Assert.AreEqual(4, game.State.Players[0].LeaderCardInstance!.CurrentLife);
        Assert.AreEqual(0, CountSkippedOnSummonEntries(game));
    }

    [TestMethod]
    public void ExecuteCardAction_NormalSummon_WithBrokenOnSummonChain_RecordsTheSkipAndKeepsTheSummon()
    {
        var game = CreateGame(definitionId: "onsummon-def-broken-chain");

        registry.ExecuteCardAction(game.Id, CreateSummonRequest(), CreateSequentialExecutor());

        // The board mutation already happened, so a trigger chain whose branch target does not exist is
        // recorded instead of thrown - a half-mutated game with no way to continue is the failure mode this
        // guards against.
        Assert.AreEqual(SummonedInstanceId, game.State.Players[0].Battlefield.Single().InstanceId);
        Assert.AreEqual(0, game.State.Players[0].Hand.Count);

        var entry = SingleSkippedOnSummonEntry(game);
        Assert.AreEqual("p1", entry.PlayerId);
        StringAssert.Contains(entry.Message, "missing-effect");
        Assert.AreEqual(SummonedInstanceId, entry.Metadata["sourceCardInstanceId"]);
        Assert.AreEqual(nameof(EffectTiming.OnSummon), entry.Metadata["timing"]);
    }

    [TestMethod]
    public void ExecuteCardAction_NormalSummon_WhenOnSummonEffectHasNoValidTargets_StillSummons()
    {
        var game = CreateGame(definitionId: "onsummon-def-unsatisfiable");

        registry.ExecuteCardAction(game.Id, CreateSummonRequest(), CreateSequentialExecutor());

        // Nothing on the opposing field can satisfy the effect's target rules, so the engine takes the node's
        // (absent) failure branch and resolves no modification. The summon itself is unaffected and no
        // skipped-trigger entry is written, because the effect was not attempted at all.
        Assert.AreEqual(SummonedInstanceId, game.State.Players[0].Battlefield.Single().InstanceId);
        Assert.AreEqual(4, game.State.Players[0].LeaderCardInstance!.CurrentLife);
        Assert.AreEqual(0, CountSkippedOnSummonEntries(game));
    }

    [TestMethod]
    public void ExecuteAutomaticOnSummonEffects_AtTriggerDepthLimit_StopsAndRecordsTheSkip()
    {
        var game = CreateGame(definitionId: "onsummon-def", putCardInHand: false);
        var summonedCard = AddBattlefieldCard(game, SummonedInstanceId, "onsummon-def");

        // A nested triggering summon arrives with the summoning chain's depth: at the limit the runner drops
        // the trigger instead of recursing further, and says so in the action log.
        GameTriggeredEffectRunner.ExecuteAutomaticOnSummonEffects(
            game,
            actingPlayerId: "p1",
            summonedCard,
            sequentialEffectExecutor: CreateSequentialExecutor(),
            triggerDepth: GameTriggeredEffectRunner.MaxTriggerDepth);

        Assert.AreEqual(4, game.State.Players[0].LeaderCardInstance!.CurrentLife);

        var entry = SingleSkippedOnSummonEntry(game);
        StringAssert.Contains(entry.Message, $"limit ({GameTriggeredEffectRunner.MaxTriggerDepth}) reached");
        Assert.AreEqual(SummonedInstanceId, entry.Metadata["sourceCardInstanceId"]);
        Assert.AreEqual(nameof(EffectTiming.OnSummon), entry.Metadata["timing"]);
    }

    [TestMethod]
    public void ExecuteCardAction_RequirementSummon_RunsOnSummonEffectOfTheSummonedCard()
    {
        var game = CreateGame(definitionId: "tribute-summon-def");
        AddBattlefieldCard(game, TributeMaterialInstanceId, "card-1");

        registry.ExecuteCardAction(game.Id, CreateRequirementSummonRequest(), CreateSequentialExecutor());

        Assert.AreEqual(SummonedInstanceId, game.State.Players[0].Battlefield.Single().InstanceId);
        Assert.AreEqual(0, game.State.Players[0].Hand.Count);
        Assert.AreEqual(TributeMaterialInstanceId, game.State.Players[0].DiscardPile.Single().InstanceId);

        // A requirement (tribute) summon is a normal summon too, so the summoned card's mandatory
        // "[On Summon]" effect ran (life 4 -> 5) - and, because the card cannot be normal summoned, no summon
        // card was spent.
        Assert.AreEqual(5, game.State.Players[0].LeaderCardInstance!.CurrentLife);
        Assert.IsTrue(game.State.IsSummonCardReady("p1"));
        Assert.AreEqual(0, CountSkippedOnSummonEntries(game));
        Assert.IsNull(game.GetPendingPrompt());
    }

    [TestMethod]
    public void ExecuteCardAction_RequirementSummon_WithOnSummonReveal_SuspendsForPresentationThenSummonsTheRevealedCard()
    {
        // Mirrors N-022 (Manda): only a summon-requirement (tribute) summon can place it, and its
        // "[On Summon]" chain reveals the top card of the deck before it is summoned.
        var game = CreateGame(definitionId: "tribute-summon-reveal-def");
        AddBattlefieldCard(game, TributeMaterialInstanceId, "card-1");
        AddDeckCard(game, RevealDeckInstanceId, "card-1");

        registry.ExecuteCardAction(game.Id, CreateRequirementSummonRequest(), CreateRevealChainExecutor());

        // The tribute was paid and the EX card landed, then its mandatory "[On Summon]" reveal ran.
        Assert.IsTrue(game.State.Players[0].Battlefield.Any(card => card.InstanceId == SummonedInstanceId));
        Assert.IsTrue(game.State.Players[0].DiscardPile.Any(card => card.InstanceId == TributeMaterialInstanceId));

        // The reveal is presented before the summon resolves: the top card is face up in the deck and stays
        // there until the player acknowledges the presentation.
        var revealedCard = game.State.Players[0].Deck.Single(card => card.InstanceId == RevealDeckInstanceId);
        Assert.IsTrue(revealedCard.IsRevealedToBothPlayers);
        Assert.AreEqual(PlayerZone.Deck, revealedCard.RevealedInZone);

        var prompt = game.GetPendingPrompt();
        Assert.IsNotNull(prompt);
        Assert.AreEqual(GamePromptType.Effect, prompt.Type);
        Assert.AreEqual(EffectSelectionPromptKind.RevealPresentation, prompt.SelectionPromptKind);
        Assert.AreEqual("p1", prompt.RequestedPlayerId);
        Assert.AreEqual(PlayerZone.Deck, prompt.CandidateZone);
        Assert.AreEqual("p1", prompt.CandidatePlayerId);

        registry.ResolvePrompt(
            game.Id,
            requestedPlayerId: "p1",
            selectedOption: ReactiveEffectExecutionConstants.RevealPresentedOption,
            reactiveEffectOrchestrator: null,
            sequentialEffectExecutor: CreateRevealChainExecutor());

        // The resumed chain handed the revealed card to the summon step, so it lands on the field.
        Assert.IsNull(game.GetPendingPrompt());
        Assert.IsTrue(game.State.Players[0].Battlefield.Any(card => card.InstanceId == RevealDeckInstanceId));
        Assert.IsFalse(game.State.Players[0].Deck.Any(card => card.InstanceId == RevealDeckInstanceId));
    }

    [TestMethod]
    public void ExecuteCardAction_RequirementSummon_WithOnSummonReveal_PresentsTheRevealEvenWhenThePostConditionFails()
    {
        // The reveal must be presented whether or not the top card is a legal summon target: if the revealed card
        // is an EX Character the "non-EX Character" post-condition refuses it, the chain ends, and the card turns
        // back over - the reveal itself still happened.
        var game = CreateGame(definitionId: "tribute-summon-reveal-def");
        AddBattlefieldCard(game, TributeMaterialInstanceId, "card-1");
        AddDeckCard(game, RevealDeckInstanceId, "reveal-ex-card");

        registry.ExecuteCardAction(game.Id, CreateRequirementSummonRequest(), CreateRevealChainExecutor());

        var revealedCard = game.State.Players[0].Deck.Single(card => card.InstanceId == RevealDeckInstanceId);
        Assert.IsTrue(revealedCard.IsRevealedToBothPlayers);
        Assert.AreEqual(PlayerZone.Deck, revealedCard.RevealedInZone);

        var prompt = game.GetPendingPrompt();
        Assert.IsNotNull(prompt);
        Assert.AreEqual(EffectSelectionPromptKind.RevealPresentation, prompt.SelectionPromptKind);
        Assert.AreEqual(PlayerZone.Deck, prompt.CandidateZone);

        registry.ResolvePrompt(
            game.Id,
            requestedPlayerId: "p1",
            selectedOption: ReactiveEffectExecutionConstants.RevealPresentedOption,
            reactiveEffectOrchestrator: null,
            sequentialEffectExecutor: CreateRevealChainExecutor());

        // The refused card stays in the deck and goes back face down; summoning it never happens.
        Assert.IsNull(game.GetPendingPrompt());
        Assert.IsFalse(revealedCard.IsRevealedToBothPlayers);
        Assert.IsTrue(game.State.Players[0].Deck.Any(card => card.InstanceId == RevealDeckInstanceId));
        Assert.IsFalse(game.State.Players[0].Battlefield.Any(card => card.InstanceId == RevealDeckInstanceId));
    }

    [TestMethod]
    public void ExecuteCardAction_NormalSummon_ChainedSubordinateStep_IsNotDispatchedAsItsOwnOnSummonTrigger()
    {
        // Mirrors N-013 (Itachi Uchiha), whose chained Freeze Card step carries the same `On Summon` timing as
        // the reveal that owns it. The trigger runner dispatches purely on `Timing`, so it used to run that step
        // as a second "[On Summon]" - freezing a target on every summon, whatever the reveal turned over, and
        // before the reveal had even been presented.
        var game = CreateGame(definitionId: "onsummon-def-chained-freeze");
        AddDeckCard(game, RevealDeckInstanceId, "card-1");

        registry.ExecuteCardAction(game.Id, CreateSummonRequest(), CreateRevealFreezeExecutor());

        var prompt = game.GetPendingPrompt();
        Assert.IsNotNull(prompt);
        Assert.AreEqual(
            EffectSelectionPromptKind.RevealPresentation,
            prompt.SelectionPromptKind,
            "The reveal the chain head presented must come first; a freeze prompt here means the chained step ran on its own.");

        registry.ResolvePrompt(
            game.Id,
            requestedPlayerId: "p1",
            selectedOption: ReactiveEffectExecutionConstants.RevealPresentedOption,
            reactiveEffectOrchestrator: null,
            sequentialEffectExecutor: CreateRevealFreezeExecutor());

        // The revealed top card is not an [Uchiha Clan] card, so the reveal's post-condition fails and its
        // success branch never runs: no freeze prompt is raised and nothing is frozen.
        Assert.IsNull(game.GetPendingPrompt());
        Assert.IsFalse(
            game.State.AppliedCardEffects.Any(effectState => string.Equals(
                effectState.Keyword,
                FreezeCardEffect.CannotAttackKeyword,
                StringComparison.Ordinal)),
            "A non-[Uchiha Clan] reveal must not freeze anything.");
    }

    [TestMethod]
    public void ExecuteCardAction_NormalSummon_ChainedSubordinateStep_RunsThroughTheRevealSuccessBranch()
    {
        // The other half of the contract: once the chained step is reached through the reveal's success branch
        // (the revealed card is an [Uchiha Clan] card here), it still asks for its target and freezes it.
        var game = CreateGame(definitionId: "onsummon-def-chained-freeze");
        AddDeckCard(game, RevealDeckInstanceId, "uchiha-card");

        registry.ExecuteCardAction(game.Id, CreateSummonRequest(), CreateRevealFreezeExecutor());

        var presentation = game.GetPendingPrompt();
        Assert.IsNotNull(presentation);
        Assert.AreEqual(EffectSelectionPromptKind.RevealPresentation, presentation.SelectionPromptKind);

        registry.ResolvePrompt(
            game.Id,
            requestedPlayerId: "p1",
            selectedOption: ReactiveEffectExecutionConstants.RevealPresentedOption,
            reactiveEffectOrchestrator: null,
            sequentialEffectExecutor: CreateRevealFreezeExecutor());

        var freezePrompt = game.GetPendingPrompt();
        Assert.IsNotNull(freezePrompt);
        Assert.AreEqual(EffectSelectionPromptKind.FreezeFromZone, freezePrompt.SelectionPromptKind);
        Assert.IsTrue(freezePrompt.Options.Count > 0);

        var frozenTargetId = freezePrompt.Options[0];
        registry.ResolvePrompt(
            game.Id,
            requestedPlayerId: "p1",
            selectedOption: frozenTargetId,
            reactiveEffectOrchestrator: null,
            sequentialEffectExecutor: CreateRevealFreezeExecutor());

        Assert.IsNull(game.GetPendingPrompt());
        Assert.IsTrue(
            game.State.AppliedCardEffects.Any(effectState =>
                string.Equals(effectState.Keyword, FreezeCardEffect.CannotAttackKeyword, StringComparison.Ordinal)
                && string.Equals(effectState.TargetCardInstanceId, frozenTargetId, StringComparison.Ordinal)),
            "A matching reveal must freeze the chosen card.");
    }

    [TestMethod]
    public void ExecuteAutomaticOnSummonEffects_SkipsAChainedStepThatWasNotFlaggedSubordinate()
    {
        // Chain membership is decided by the branch link, not by the flag: data imported with
        // `isSubordinate: false` on a chained step must still fire once, from its starter only.
        var game = CreateGame(definitionId: "onsummon-def-unflagged-chain");
        var recordingExecutor = new RecordingSequentialEffectExecutor();

        GameTriggeredEffectRunner.ExecuteAutomaticOnSummonEffects(
            game,
            actingPlayerId: "p1",
            summonedCard: AddBattlefieldCard(game, SummonedInstanceId, "onsummon-def-unflagged-chain"),
            sequentialEffectExecutor: recordingExecutor);

        CollectionAssert.AreEqual(new[] { "reveal-top" }, recordingExecutor.ExecutedEffectIds.ToArray());
    }

    [TestMethod]
    public void ExecuteAutomaticOnSummonEffects_DispatchesOnlyTheChainHead_WhenASubordinateStepSharesTheTiming()
    {
        var game = CreateGame(definitionId: "onsummon-def-chained-freeze");
        var recordingExecutor = new RecordingSequentialEffectExecutor();

        GameTriggeredEffectRunner.ExecuteAutomaticOnSummonEffects(
            game,
            actingPlayerId: "p1",
            summonedCard: AddBattlefieldCard(game, SummonedInstanceId, "onsummon-def-chained-freeze"),
            sequentialEffectExecutor: recordingExecutor);

        // The subordinate freeze step is reached through the reveal's success branch only.
        CollectionAssert.AreEqual(new[] { "reveal-top" }, recordingExecutor.ExecutedEffectIds.ToArray());
    }

    [TestMethod]
    public void ExecuteCardAction_NormalSummon_PromptedOnSummonTrashRecall_AsksWithTheTrashAndResumesWithTheAnswer()
    {
        var recallEffect = new RecordingSummonEffect();
        var game = CreateGame(definitionId: "onsummon-def-trash-recall");
        AddTrashCard(game, TrashRecallInstanceId, TrashRecallDefinitionId);

        registry.ExecuteCardAction(game.Id, CreateSummonRequest(), CreateSequentialExecutor(recallEffect));

        // The summon itself already happened; the "[On Summon]" chain suspended to ask which trash card to summon.
        Assert.AreEqual(SummonedInstanceId, game.State.Players[0].Battlefield.Single().InstanceId);
        Assert.AreEqual(0, recallEffect.SelectedTargetInstanceIds.Count);

        var prompt = game.GetPendingPrompt();
        Assert.IsNotNull(prompt);
        Assert.AreEqual(GamePromptType.Effect, prompt.Type);
        Assert.AreEqual("p1", prompt.RequestedPlayerId);
        Assert.AreEqual(EffectSelectionPromptKind.SummonFromZone, prompt.SelectionPromptKind);
        Assert.AreEqual(PlayerZone.Trash, prompt.CandidateZone);
        Assert.AreEqual("p1", prompt.CandidatePlayerId);
        CollectionAssert.AreEqual(new[] { TrashRecallInstanceId }, prompt.Options.ToArray());
        Assert.IsNotNull(prompt.EffectContinuation);

        registry.ResolvePrompt(
            game.Id,
            requestedPlayerId: "p1",
            selectedOption: TrashRecallInstanceId,
            reactiveEffectOrchestrator: null,
            sequentialEffectExecutor: CreateSequentialExecutor(recallEffect));

        // The answer travelled through the continuation into the resumed node as its selection.
        Assert.IsNull(game.GetPendingPrompt());
        CollectionAssert.AreEqual(new[] { TrashRecallInstanceId }, recallEffect.SelectedTargetInstanceIds.ToArray());
    }

    [TestMethod]
    public void ExecuteCardAction_NormalSummon_ResumedTrashRecall_SummonsCardThatCannotBeNormalSummoned()
    {
        var recallEffect = CreateSummonCardEffect();
        var game = CreateGame(definitionId: "onsummon-def-trash-recall");
        AddTrashCard(game, TrashRecallInstanceId, TrashRecallDefinitionId);
        // The recalled card rested before it left play (Gamabunta tributes a character that already attacked):
        // the trash keeps the flag, so the re-summon has to place it standing.
        game.State.Players[0].DiscardPile.Single(card => card.InstanceId == TrashRecallInstanceId).IsRested = true;
        // N-003 prints "No Normal Summon" and still summons a copy of itself from the trash/deck: an effect
        // summon is a special summon, so the flag must neither filter the candidate pool nor refuse the
        // placement (this is the real SummonCardEffect, not the recording double).
        game.State.CardDefinitions[TrashRecallDefinitionId].CannotBeNormalSummoned = true;

        registry.ExecuteCardAction(game.Id, CreateSummonRequest(), CreateSequentialExecutor(recallEffect));

        var prompt = game.GetPendingPrompt();
        Assert.IsNotNull(prompt);
        CollectionAssert.AreEqual(new[] { TrashRecallInstanceId }, prompt.Options.ToArray());

        registry.ResolvePrompt(
            game.Id,
            requestedPlayerId: "p1",
            selectedOption: TrashRecallInstanceId,
            reactiveEffectOrchestrator: null,
            sequentialEffectExecutor: CreateSequentialExecutor(recallEffect));

        // The resumed "Summon Card" node placed the flagged card on the field and took it out of the trash.
        Assert.IsTrue(game.State.Players[0].Battlefield.Any(card => card.InstanceId == TrashRecallInstanceId));
        // Entering the field is an unrested placement: the rested flag the card carried in the trash is cleared.
        Assert.IsFalse(
            game.State.Players[0].Battlefield.Single(card => card.InstanceId == TrashRecallInstanceId).IsRested);
        Assert.AreEqual(0, game.State.Players[0].DiscardPile.Count);
        Assert.IsNull(game.GetPendingPrompt());
    }

    private static SummonCardEffect CreateSummonCardEffect()
    {
        return new SummonCardEffect(
            effectSpecResolver: new GameRuntimeEffectSpecResolver(),
            canExecuteEvaluator: new GameEffectCanExecuteEvaluator(
                new EffectContextConditionEvaluator(),
                new EffectTargetResolver(),
                new GameValidTargetResultFactory(),
                new GameEffectConditionDiagnostics()),
            targetResolver: new EffectTargetResolver());
    }

    private static int CountSkippedOnSummonEntries(GameInstance game)
    {
        return game.ActionLog.Count(entry =>
            entry.ActionType == GameTriggeredEffectRunner.OnSummonSkippedActionType);
    }

    private static GameActionLogEntry SingleSkippedOnSummonEntry(GameInstance game)
    {
        var entries = game.ActionLog
            .Where(entry => entry.ActionType == GameTriggeredEffectRunner.OnSummonSkippedActionType)
            .ToList();

        Assert.AreEqual(1, entries.Count, "Expected exactly one skipped '[On Summon]' entry.");
        return entries[0];
    }

    private GameInstance CreateGame(string definitionId, bool putCardInHand = true)
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["leader-def", "card-1"] },
                new Player { Id = "p2", Deck = ["leader-def", "card-1"] },
            ],
            cardDefinitions: BuildDefinitions());

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.MainPhase;
        game.State.ActivePlayerId = "p1";
        game.State.PriorityPlayerId = "p1";
        game.State.TurnNumber = 2;
        // Battle legality uses the active player's TurnCount for the "no attacking on the first turn" rule, so
        // the fixture sits outside that window and the MainPhase keeps a legal action (a leader attack) - the
        // phase automation would otherwise end the MainPhase underneath the assertions.
        game.State.Players[0].TurnCount = 2;
        game.State.Players[0].Battlefield.Clear();
        game.State.Players[0].Hand.Clear();
        game.State.Players[0].LeaderCardInstance!.CurrentLife = 4;
        game.State.SetSummonCardReady("p1", true);

        if (putCardInHand)
        {
            game.State.Players[0].Hand.Add(new CardInstance
            {
                InstanceId = SummonedInstanceId,
                CardDefinitionId = definitionId,
                OwnerPlayerId = "p1",
                ControllerPlayerId = "p1",
            });
        }

        return game;
    }

    private static CardInstance AddBattlefieldCard(GameInstance game, string instanceId, string definitionId)
    {
        var card = new CardInstance
        {
            InstanceId = instanceId,
            CardDefinitionId = definitionId,
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
            IsRested = false,
        };

        game.State.Players[0].Battlefield.Add(card);
        return card;
    }

    private static GameCardActionExecutionRequest CreateSummonRequest()
    {
        return new GameCardActionExecutionRequest(
            PlayerId: "p1",
            ActionId: $"summon-to-field:{SummonedInstanceId}",
            SourceCardInstanceId: SummonedInstanceId);
    }

    private static GameCardActionExecutionRequest CreateRequirementSummonRequest()
    {
        return new GameCardActionExecutionRequest(
            PlayerId: "p1",
            ActionId: $"summon-to-field:{SummonedInstanceId}",
            SourceCardInstanceId: SummonedInstanceId,
            SelectedTargets:
            [
                new GameEffectTargetReference("p1", PlayerZone.CharacterField, TributeMaterialInstanceId)
            ]);
    }

    private static IGameSequentialEffectExecutor CreateSequentialExecutor(IGameCardEffect? extraEffect = null)
    {
        var canExecuteEvaluator = new GameEffectCanExecuteEvaluator(
            new EffectContextConditionEvaluator(),
            new EffectTargetResolver(),
            new GameValidTargetResultFactory(),
            new GameEffectConditionDiagnostics());
        var targetResolver = new EffectTargetResolver();
        var effectSpecResolver = new GameRuntimeEffectSpecResolver();

        var effects = new List<IGameCardEffect>
        {
            new ModifyAttributeEffect(effectSpecResolver, canExecuteEvaluator, targetResolver),
        };

        if (extraEffect is not null)
        {
            effects.Add(extraEffect);
        }

        return new GameSequentialEffectExecutor(new GameCardEffectRegistry(effects));
    }

    private static Dictionary<string, Card> BuildDefinitions()
    {
        return new Dictionary<string, Card>(StringComparer.Ordinal)
        {
            ["leader-def"] = new LeaderCard
            {
                Id = "leader-def",
                DisplayName = "Leader",
                Name = ["Leader"],
                Type = CardType.Leader,
                Color = CardColor.Blue,
                Traits = ["Leader"],
                Description = string.Empty,
                Damage = 1,
                Power = 0,
                Life = 5,
            },
            ["card-1"] = CreateCharacterDefinition("card-1", "Filler", []),
            ["reveal-ex-card"] = CreateExCharacterDefinition("reveal-ex-card"),
            ["onsummon-def"] = CreateCharacterDefinition(
                "onsummon-def",
                "On Summon",
                [CreateLifeGainEffect()]),
            ["onsummon-def-optional"] = CreateCharacterDefinition(
                "onsummon-def-optional",
                "On Summon Optional",
                [CreateLifeGainEffect(isOptional: true)]),
            ["onsummon-def-when-attacking"] = CreateCharacterDefinition(
                "onsummon-def-when-attacking",
                "On Summon (When Attacking)",
                [CreateLifeGainEffect(timing: EffectTiming.WhenAttacking)]),
            ["onsummon-def-broken-chain"] = CreateCharacterDefinition(
                "onsummon-def-broken-chain",
                "On Summon Broken",
                [CreateLifeGainEffect(onSuccessEffectId: "missing-effect")]),
            ["onsummon-def-unsatisfiable"] = CreateCharacterDefinition(
                "onsummon-def-unsatisfiable",
                "On Summon Unsatisfiable",
                [CreateTargetedOpponentEffect()]),
            ["onsummon-def-trash-recall"] = CreateCharacterDefinition(
                "onsummon-def-trash-recall",
                "On Summon Trash Recall",
                [CreateTrashRecallEffect()]),
            ["onsummon-def-chained-freeze"] = CreateCharacterDefinition(
                "onsummon-def-chained-freeze",
                "On Summon Chained Freeze",
                [CreateChainedFreezeStep(), CreateChainedFreezeRevealEffect()]),
            ["onsummon-def-unflagged-chain"] = CreateCharacterDefinition(
                "onsummon-def-unflagged-chain",
                "On Summon Unflagged Chain",
                [CreateChainedFreezeStep(isSubordinate: false), CreateChainedFreezeRevealEffect()]),
            ["uchiha-card"] = CreateUchihaCharacterDefinition("uchiha-card"),
            ["tribute-summon-def"] = CreateTributeSummonDefinition(),
            ["tribute-summon-reveal-def"] = CreateTributeSummonRevealDefinition(),
        };
    }

    private static CharacterCard CreateCharacterDefinition(
        string definitionId,
        string displayName,
        List<EffectSpec> effects,
        bool cannotBeNormalSummoned = false)
    {
        var definition = new CharacterCard
        {
            Id = definitionId,
            DisplayName = displayName,
            Name = [displayName],
            Type = CardType.Character,
            Color = CardColor.Blue,
            Traits = ["Ninja"],
            Description = string.Empty,
            Damage = 1,
            Power = 1,
            Health = 5,
        };

        if (cannotBeNormalSummoned)
        {
            definition.CannotBeNormalSummoned = true;
            definition.Conditions.Add(EffectConditionKeywords.SummonRequirements);
        }

        definition.Effects.AddRange(effects);
        return definition;
    }

    private static CharacterCard CreateUchihaCharacterDefinition(string definitionId)
    {
        var definition = CreateCharacterDefinition(definitionId, "Uchiha Filler", []);
        definition.Traits = ["Uchiha Clan"];
        return definition;
    }

    private static CharacterCard CreateExCharacterDefinition(string definitionId)
    {
        var definition = CreateCharacterDefinition(definitionId, "EX Filler", []);
        definition.Type = CardType.ExCharacter;
        return definition;
    }

    /// <summary>A mandatory "[On Summon]" effect that adds 1 to its controller's leader life.</summary>
    private static EffectSpec CreateLifeGainEffect(
        bool isOptional = false,
        string? onSuccessEffectId = null,
        EffectTiming timing = EffectTiming.OnSummon)
    {
        return new EffectSpec
        {
            Id = TriggerEffectId,
            RuntimeEffectType = RuntimeEffects.ChangeValues,
            EffectType = EffectKind.Activated,
            Timing = timing,
            DurationMode = EffectDurationMode.Instant,
            IsOptional = isOptional,
            OnSuccessEffectId = onSuccessEffectId,
            ExecutionTargetSource = EffectExecutionTargetSource.None,
            AttributeModifications =
            [
                new AttributeModificationSpec
                {
                    TargetType = AttributeModificationTargetType.Leader,
                    TargetRange = EffectTargetRange.Self,
                    Attribute = EffectAttributeType.LeaderCurrentLife,
                    Operation = AttributeModificationOperation.Add,
                    Value = 1,
                }
            ],
        };
    }

    /// <summary>
    /// Mirrors the authored N-005 shape: an "[On Summon]" summon whose candidate pool is the acting player's
    /// trash and whose pick is deferred to execution time (so the chain suspends and asks).
    /// </summary>
    private static EffectSpec CreateTrashRecallEffect()
    {
        return new EffectSpec
        {
            Id = TrashRecallEffectId,
            RuntimeEffectType = RuntimeEffects.SummonCard,
            EffectType = EffectKind.Activated,
            Timing = EffectTiming.OnSummon,
            DurationMode = EffectDurationMode.Instant,
            IsOptional = false,
            ExecutionTargetSource = EffectExecutionTargetSource.SelectedTargets,
            ExecutionFlowMode = EffectExecutionFlowMode.PerStep,
            SelectionTiming = EffectSelectionTiming.Prompted,
            SelectionPromptKind = EffectSelectionPromptKind.SummonFromZone,
            TargetRules = new EffectTargetRuleSet
            {
                Operator = RequirementGroupOperator.Any,
                ExactTargetCount = 1,
                AutoSelectAllValidTargets = false,
                Rules =
                [
                    new EffectTargetRule
                    {
                        Scope = EffectTargetRange.Self,
                        InZone = PlayerZone.Trash,
                        LocationSelector = new EffectTargetLocationSelector
                        {
                            Kind = EffectTargetLocationSelectorKind.Any,
                        },
                    }
                ],
            },
        };
    }

    /// <summary>
    /// Mirrors the authored N-013 (Itachi Uchiha) chain head: a mandatory "[On Summon]" reveal whose success
    /// branch is a subordinate Freeze Card step, gated on the revealed card carrying the [Uchiha Clan] type.
    /// </summary>
    private static EffectSpec CreateChainedFreezeRevealEffect()
    {
        return new EffectSpec
        {
            Id = "reveal-top",
            RuntimeEffectType = RuntimeEffects.RevealCard,
            EffectType = EffectKind.Activated,
            Timing = EffectTiming.OnSummon,
            DurationMode = EffectDurationMode.Instant,
            IsOptional = false,
            OnSuccessEffectId = "freeze-target",
            RevealTimingMode = RevealTimingMode.RevealFirst,
            RevealPostConditionRuleSet = new ZoneCardRestrictionRuleSet
            {
                Operator = RequirementGroupOperator.All,
                Restrictions =
                [
                    new ZoneCardRestriction
                    {
                        MatchMode = ZoneRestrictionMatchMode.All,
                        Predicates =
                        [
                            new ZoneCardPropertyPredicate
                            {
                                Property = ZoneCardProperty.Trait,
                                Operator = ZoneCardPredicateOperator.Equals,
                                Value = "Uchiha Clan",
                                IgnoreCase = true,
                            }
                        ],
                    }
                ],
            },
            ExecutionTargetSource = EffectExecutionTargetSource.SelectedTargets,
            ExecutionFlowMode = EffectExecutionFlowMode.PerStep,
            TargetRules = new EffectTargetRuleSet
            {
                Operator = RequirementGroupOperator.Any,
                AutoSelectAllValidTargets = true,
                Rules =
                [
                    new EffectTargetRule
                    {
                        Scope = EffectTargetRange.Self,
                        InZone = PlayerZone.Deck,
                        LocationSelector = new EffectTargetLocationSelector
                        {
                            Kind = EffectTargetLocationSelectorKind.DeckTop,
                        },
                    }
                ],
            },
        };
    }

    /// <summary>
    /// The reveal's success branch: the authored N-013 Freeze Card step. It is reached only through
    /// <c>reveal-top</c>'s <see cref="EffectSpec.OnSuccessEffectId"/> and, exactly as the seed data authors it,
    /// it carries the same <see cref="EffectTiming.OnSummon"/> timing as its parent.
    /// </summary>
    private static EffectSpec CreateChainedFreezeStep(bool isSubordinate = true)
    {
        return new EffectSpec
        {
            Id = "freeze-target",
            IsSubordinate = isSubordinate,
            RuntimeEffectType = RuntimeEffects.FreezeCard,
            EffectType = EffectKind.Activated,
            Timing = EffectTiming.OnSummon,
            DurationMode = EffectDurationMode.DuringOpponentNextTurn,
            IsOptional = false,
            ExecutionTargetSource = EffectExecutionTargetSource.SelectedTargets,
            ExecutionFlowMode = EffectExecutionFlowMode.PerStep,
            SelectionTiming = EffectSelectionTiming.Prompted,
            SelectionPromptKind = EffectSelectionPromptKind.FreezeFromZone,
            TargetRules = new EffectTargetRuleSet
            {
                Operator = RequirementGroupOperator.Any,
                ExactTargetCount = 1,
                AutoSelectAllValidTargets = false,
                Rules =
                [
                    new EffectTargetRule
                    {
                        Scope = EffectTargetRange.Any,
                        InZone = PlayerZone.Leader,
                        ExactSelectedTargetCount = 1,
                        Restriction = new ZoneCardRestriction(),
                    },
                    new EffectTargetRule
                    {
                        Scope = EffectTargetRange.Any,
                        InZone = PlayerZone.CharacterField,
                        ExactSelectedTargetCount = 1,
                        Restriction = new ZoneCardRestriction(),
                    },
                ],
            },
        };
    }

    private static void AddTrashCard(GameInstance game, string instanceId, string definitionId)
    {
        game.State.Players[0].DiscardPile.Add(new CardInstance
        {
            InstanceId = instanceId,
            CardDefinitionId = definitionId,
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
        });

        game.State.CardDefinitions[definitionId] = new CharacterCard
        {
            Id = definitionId,
            DisplayName = "Trash Recall Card",
            Name = ["Naruto Uzumaki"],
            Type = CardType.Character,
            Color = CardColor.Blue,
            Traits = ["Ninja"],
            Description = string.Empty,
            Damage = 1,
            Power = 1,
            Health = 5,
        };
    }

    /// <summary>
    /// Replaces the acting player's deck with a single known card so the reveal's "Deck Top" selector resolves
    /// deterministically (the freshly created game deals an initial hand, so the deck contents cannot be assumed).
    /// </summary>
    private static string AddDeckCard(GameInstance game, string instanceId, string definitionId)
    {
        game.State.Players[0].Deck.Clear();
        game.State.Players[0].Deck.Add(new CardInstance
        {
            InstanceId = instanceId,
            CardDefinitionId = definitionId,
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
        });

        return instanceId;
    }

    /// <summary>
    /// The real <see cref="RevealCardEffect"/> + <see cref="SummonCardEffect"/> composition the "[On Summon]"
    /// reveal chain needs ("reveal the top card of your deck, then summon it").
    /// </summary>
    private static IGameSequentialEffectExecutor CreateRevealChainExecutor()
    {
        var canExecuteEvaluator = new GameEffectCanExecuteEvaluator(
            new EffectContextConditionEvaluator(),
            new EffectTargetResolver(),
            new GameValidTargetResultFactory(),
            new GameEffectConditionDiagnostics());
        var targetResolver = new EffectTargetResolver();
        var effectSpecResolver = new GameRuntimeEffectSpecResolver();

        return new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RevealCardEffect(effectSpecResolver, canExecuteEvaluator, targetResolver),
            new SummonCardEffect(effectSpecResolver, canExecuteEvaluator, targetResolver),
        ]));
    }

    /// <summary>
    /// The real <see cref="RevealCardEffect"/> + <see cref="FreezeCardEffect"/> composition the N-013 chain
    /// needs ("reveal the top card of your deck, and if it is [Uchiha Clan], freeze the chosen card").
    /// </summary>
    private static IGameSequentialEffectExecutor CreateRevealFreezeExecutor()
    {
        var canExecuteEvaluator = new GameEffectCanExecuteEvaluator(
            new EffectContextConditionEvaluator(),
            new EffectTargetResolver(),
            new GameValidTargetResultFactory(),
            new GameEffectConditionDiagnostics());
        var targetResolver = new EffectTargetResolver();
        var effectSpecResolver = new GameRuntimeEffectSpecResolver();

        return new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RevealCardEffect(effectSpecResolver, canExecuteEvaluator, targetResolver),
            new FreezeCardEffect(effectSpecResolver, canExecuteEvaluator, targetResolver),
        ]));
    }

    /// <summary>
    /// Stands in for <see cref="SummonCardEffect"/> in the resumed chain: it records the selection the node was
    /// handed, which is what proves the prompt answer reached the effect (the real summon behaviour itself is
    /// covered by SummonCardEffectTests).
    /// </summary>
    private sealed class RecordingSummonEffect : IGameCardEffect
    {
        public List<string> SelectedTargetInstanceIds { get; } = [];

        public string EffectTypeKey => SummonCardEffect.EffectKey;

        public CanExecuteResult CanExecute(GameCardEffectContext context)
        {
            return new CanExecuteResult { CanExecute = context.SelectedTargets.Count > 0 };
        }

        public IReadOnlyList<GameEffectTargetReference> GetValidTargets(GameCardEffectContext context)
        {
            return [];
        }

        public ErrorOr<Success> Execute(
            GameCardEffectContext context,
            IReadOnlyList<GameEffectTargetReference> selectedTargets)
        {
            SelectedTargetInstanceIds.AddRange(selectedTargets.Select(target => target.CardInstanceId));
            return Result.Success;
        }
    }

    /// <summary>
    /// Records which node each dispatched chain was cloned around, so a test can pin exactly what the trigger
    /// runner fired (the clone keeps the triggering node first).
    /// </summary>
    private sealed class RecordingSequentialEffectExecutor : IGameSequentialEffectExecutor
    {
        public List<string> ExecutedEffectIds { get; } = [];

        public ErrorOr<Success> Execute(GameCardEffectContext context)
        {
            ExecutedEffectIds.Add(context.SourceCardDefinition.Effects[0].Id);
            return Result.Success;
        }

        public ErrorOr<Success> Resume(
            GameInstance game,
            PendingEffectContinuation continuation,
            IReadOnlyList<GameEffectTargetReference> selection)
        {
            return Result.Success;
        }
    }

    /// <summary>
    /// A "[On Summon]" effect that must pick an opposing character while the opposing field stays empty, so the
    /// engine cannot execute it.
    /// </summary>
    private static EffectSpec CreateTargetedOpponentEffect()
    {
        return new EffectSpec
        {
            Id = TriggerEffectId,
            RuntimeEffectType = RuntimeEffects.ChangeValues,
            EffectType = EffectKind.Activated,
            Timing = EffectTiming.OnSummon,
            DurationMode = EffectDurationMode.Instant,
            IsOptional = false,
            ExecutionTargetSource = EffectExecutionTargetSource.SelectedTargets,
            TargetRules = new EffectTargetRuleSet
            {
                Operator = RequirementGroupOperator.Any,
                ExactTargetCount = 1,
                AutoSelectAllValidTargets = false,
                Rules =
                [
                    new EffectTargetRule
                    {
                        Scope = EffectTargetRange.Opponent,
                        InZone = PlayerZone.CharacterField,
                        ExactSelectedTargetCount = 1,
                        Restriction = new ZoneCardRestriction(),
                    }
                ],
            },
            AttributeModifications =
            [
                new AttributeModificationSpec
                {
                    TargetType = AttributeModificationTargetType.SelectedTargets,
                    Attribute = EffectAttributeType.CardPower,
                    Operation = AttributeModificationOperation.Subtract,
                    Value = 1,
                }
            ],
        };
    }

    /// <summary>
    /// Mirrors the authored N-022 (Manda) shape: a summon-requirement (<c>Tribute</c>) root whose success chain
    /// reveals the top card of the deck ("Reveal First", non-EX Character post-condition) and then summons it.
    /// The reveal node is authored <c>On Summon</c> because that is the timing the trigger runner dispatches -
    /// N-022's was authored <c>Quick</c>, so the top card was never revealed on summon.
    /// </summary>
    private static CharacterCard CreateTributeSummonRevealDefinition()
    {
        var definition = CreateCharacterDefinition(
            "tribute-summon-reveal-def",
            "Tribute Summon Reveal Card",
            [CreateOnSummonRevealEffect(), CreateRevealedSummonEffect()],
            cannotBeNormalSummoned: true);
        definition.Color = CardColor.Red;

        definition.Effects.Add(new EffectSpec
        {
            Id = "tribute-requirement",
            RuntimeEffectType = RuntimeEffects.Tribute,
            EffectType = EffectKind.SummonRequirement,
            Timing = EffectTiming.DuringYourMain,
            ExecutionFlowMode = EffectExecutionFlowMode.AtomicChain,
            OnSuccessEffectId = "reveal-top",
            ExecutionTargetSource = EffectExecutionTargetSource.SelectedTargets,
            TargetRules = new EffectTargetRuleSet
            {
                TributeComposition = new TributeTargetComposition
                {
                    ExactTributeCount = 1,
                    RequireSingleSummonTarget = true,
                    RequireDistinctSummonAndTributes = true,
                },
                Rules =
                [
                    new EffectTargetRule
                    {
                        Scope = EffectTargetRange.Self,
                        InZone = PlayerZone.CharacterField,
                        TributeRole = TributeTargetRole.TributeMaterial,
                        ExactSelectedTargetCount = 1,
                        Restriction = new ZoneCardRestriction(),
                    }
                ],
            },
        });

        return definition;
    }

    /// <summary>The mandatory "[On Summon]" reveal: turn over the top card of the deck so it can be presented.</summary>
    private static EffectSpec CreateOnSummonRevealEffect()
    {
        return new EffectSpec
        {
            Id = "reveal-top",
            IsSubordinate = true,
            RuntimeEffectType = RuntimeEffects.RevealCard,
            EffectType = EffectKind.Activated,
            Timing = EffectTiming.OnSummon,
            DurationMode = EffectDurationMode.Instant,
            RevealTimingMode = RevealTimingMode.RevealFirst,
            RevealPostConditionRestriction = new ZoneCardRestriction
            {
                MatchMode = ZoneRestrictionMatchMode.All,
                Predicates =
                [
                    new ZoneCardPropertyPredicate
                    {
                        Property = ZoneCardProperty.Type,
                        Operator = ZoneCardPredicateOperator.NotEquals,
                        Value = "EX Character",
                        IgnoreCase = true,
                    }
                ],
            },
            OnSuccessEffectId = "summon-revealed-card",
            ExecutionTargetSource = EffectExecutionTargetSource.SelectedTargets,
            ExecutionFlowMode = EffectExecutionFlowMode.PerStep,
            TargetRules = new EffectTargetRuleSet
            {
                Operator = RequirementGroupOperator.Any,
                AutoSelectAllValidTargets = true,
                Rules =
                [
                    new EffectTargetRule
                    {
                        Scope = EffectTargetRange.Self,
                        InZone = PlayerZone.Deck,
                        LocationSelector = new EffectTargetLocationSelector
                        {
                            Kind = EffectTargetLocationSelectorKind.DeckTop,
                        },
                    }
                ],
            },
        };
    }

    /// <summary>The reveal's success branch: summon the card the previous step turned over.</summary>
    private static EffectSpec CreateRevealedSummonEffect()
    {
        return new EffectSpec
        {
            Id = "summon-revealed-card",
            IsSubordinate = true,
            RuntimeEffectType = RuntimeEffects.SummonCard,
            EffectType = EffectKind.Activated,
            Timing = EffectTiming.DuringYourMain,
            DurationMode = EffectDurationMode.Instant,
            ExecutionTargetSource = EffectExecutionTargetSource.SelectedTargets,
            ExecutionFlowMode = EffectExecutionFlowMode.PerStep,
            TargetRules = new EffectTargetRuleSet
            {
                Operator = RequirementGroupOperator.Any,
                ExactTargetCount = 1,
                AutoSelectAllValidTargets = false,
                Rules = [],
            },
        };
    }

    /// <summary>
    /// A card that can only be summoned by meeting a tribute requirement, mirroring the real N-* fixture: the
    /// summon-requirement action itself carries a "[On Summon]" effect that must run when the summon completes.
    /// </summary>
    private static CharacterCard CreateTributeSummonDefinition()
    {
        var definition = CreateCharacterDefinition(
            "tribute-summon-def",
            "Tribute Summon Card",
            [CreateLifeGainEffect()],
            cannotBeNormalSummoned: true);
        definition.Color = CardColor.Red;

        definition.Effects.Add(new EffectSpec
        {
            Id = "tribute-1",
            RuntimeEffectType = RuntimeEffects.Tribute,
            EffectType = EffectKind.Activated,
            Timing = EffectTiming.ActivateMain,
            TargetRules = new EffectTargetRuleSet
            {
                TributeComposition = new TributeTargetComposition
                {
                    ExactTributeCount = 1,
                    // The authored catalogue always marks a single summon candidate and keeps the tributes
                    // distinct from it; mirror that shape rather than relying on the model defaults.
                    RequireSingleSummonTarget = true,
                    RequireDistinctSummonAndTributes = true,
                },
                Rules =
                [
                    new EffectTargetRule
                    {
                        Scope = EffectTargetRange.Self,
                        InZone = PlayerZone.CharacterField,
                        TributeRole = TributeTargetRole.TributeMaterial,
                        ExactSelectedTargetCount = 1,
                        Restriction = new ZoneCardRestriction(),
                    }
                ],
            },
        });

        return definition;
    }
}
