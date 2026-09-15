using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// End-to-end support activation behaviour with the real effect registry and sequential executor:
/// payment/consumption at activation, deferred replay on the double pass, LIFO chaining and
/// Support Activated negation.
/// </summary>
[TestClass]
public sealed class SupportActivationResolutionTests
{
    private static readonly GameEffectCanExecuteEvaluator CanExecuteEvaluator = new(
        new EffectContextConditionEvaluator(),
        new EffectTargetResolver(),
        new GameValidTargetResultFactory(),
        new GameEffectConditionDiagnostics());

    [TestMethod]
    public void ActivateSupport_FromHand_DuringMainPhase_OpensReactionWindow_ThenResolvesAfterBothPass()
    {
        var game = CreateGame();
        game.State.Phase = GamePhase.MainPhase;
        game.State.ActivePlayerId = "p1";
        game.State.PriorityPlayerId = "p1";
        game.State.Players[0].ResourcePool = 5;
        AddHandCard(game, playerIndex: 0, instanceId: "hand-support-1", definitionId: "destroy-support");
        AddBattlefieldCard(game, playerIndex: 1, instanceId: "enemy-1", definitionId: "filler");

        var executor = CreateSequentialExecutor();

        ExecuteSupport(
            game,
            playerId: "p1",
            instanceId: "hand-support-1",
            executor,
            selectedTargets: [CharacterTarget("p2", "enemy-1")]);

        // Paid and consumed, but it waits: the opponent may answer with a Support Activated card, so
        // priority sits with them and nothing has resolved yet.
        Assert.AreEqual(3, game.State.Players[0].ResourcePool);
        Assert.IsFalse(game.State.Players[0].Hand.Any(card => card.InstanceId == "hand-support-1"));
        Assert.AreEqual(1, game.State.EffectResolutionStack.Count);
        Assert.AreEqual(1, game.State.Players[1].Battlefield.Count);
        Assert.AreEqual("p2", game.State.PriorityPlayerId);

        PassInActionStep(game, "p2", executor);
        PassInActionStep(game, "p1", executor);

        // Both passed: the activation resolves and the turn player gets priority back.
        Assert.AreEqual(0, game.State.EffectResolutionStack.Count);
        Assert.AreEqual(0, game.State.Players[1].Battlefield.Count);
        Assert.AreEqual("p1", game.State.PriorityPlayerId);
    }

    [TestMethod]
    public void ActivateSupport_DuringMainPhase_CanBeNegated_FromTheSupportZone()
    {
        var game = CreateGame();
        game.State.Phase = GamePhase.MainPhase;
        game.State.ActivePlayerId = "p1";
        game.State.PriorityPlayerId = "p1";
        game.State.Players[0].ResourcePool = 5;
        AddHandCard(game, playerIndex: 0, instanceId: "hand-support-1", definitionId: "destroy-support");
        AddBattlefieldCard(game, playerIndex: 1, instanceId: "enemy-1", definitionId: "filler");
        // The reacting player is not the turn player, so their response comes from the support area.
        AddSupportZoneCard(game, playerIndex: 1, instanceId: "negate-1", definitionId: "negate-support");
        game.State.Players[1].ResourcePool = 5;

        var executor = CreateSequentialExecutor();

        ExecuteSupport(
            game,
            playerId: "p1",
            instanceId: "hand-support-1",
            executor,
            selectedTargets: [CharacterTarget("p2", "enemy-1")]);

        Assert.AreEqual("p2", game.State.PriorityPlayerId);
        var targetsResponse = GetSupportTargets(game, playerId: "p2", instanceId: "negate-1");
        Assert.IsTrue(targetsResponse.IsEnabled, targetsResponse.DisabledReason);
        Assert.AreEqual(1, targetsResponse.ValidTargets.Count);
        Assert.IsTrue(targetsResponse.ValidTargets[0].IsEffectResolutionStackTarget);

        ExecuteSupport(
            game,
            playerId: "p2",
            instanceId: "negate-1",
            executor,
            selectedTargets: [targetsResponse.ValidTargets[0]]);

        var negatingPlayerStartingLife = game.State.Players[1].LeaderCardInstance!.CurrentLife;
        Assert.AreEqual("p1", game.State.PriorityPlayerId);

        PassInActionStep(game, "p1", executor);
        PassInActionStep(game, "p2", executor);

        Assert.AreEqual(0, game.State.EffectResolutionStack.Count);
        // The MainPhase support was negated: its K.O. never happened, while the negate's own follow-up
        // (lose 2 life) did.
        Assert.AreEqual(1, game.State.Players[1].Battlefield.Count);
        Assert.AreEqual(negatingPlayerStartingLife - 2, game.State.Players[1].LeaderCardInstance!.CurrentLife);
    }

    [TestMethod]
    public void ActivateSupport_DuringCutIn_WaitsForDoublePass_ThenResolvesMostRecentFirst()
    {
        var game = CreateGame();
        EnterCutInWindow(game, priorityPlayerId: "p2");
        AddSupportZoneCard(game, playerIndex: 1, instanceId: "support-1", definitionId: "destroy-support-attack");
        AddSupportZoneCard(game, playerIndex: 1, instanceId: "support-2", definitionId: "destroy-support-attack");
        AddBattlefieldCard(game, playerIndex: 0, instanceId: "enemy-1", definitionId: "filler");
        AddBattlefieldCard(game, playerIndex: 0, instanceId: "enemy-2", definitionId: "filler");
        game.State.Players[1].ResourcePool = 5;

        var executor = CreateSequentialExecutor();

        ExecuteSupport(
            game,
            playerId: "p2",
            instanceId: "support-1",
            executor,
            selectedTargets: [CharacterTarget("p1", "enemy-1")]);
        game.State.PriorityPlayerId = "p2";
        ExecuteSupport(
            game,
            playerId: "p2",
            instanceId: "support-2",
            executor,
            selectedTargets: [CharacterTarget("p1", "enemy-2")]);

        Assert.AreEqual(2, game.State.EffectResolutionStack.Count);
        Assert.AreEqual(2, game.State.Players[0].Battlefield.Count, "nothing resolves before the window closes");
        Assert.AreEqual(3, game.State.Players[1].ResourcePool);

        // Both players pass: most recently activated resolves first, and both bounced a character.
        PassInActionStep(game, "p1", executor);
        PassInActionStep(game, "p2", executor);

        Assert.AreEqual(0, game.State.EffectResolutionStack.Count);
        Assert.AreEqual(0, game.State.Players[0].Battlefield.Count);
    }

    [TestMethod]
    public void ActivateSupport_NegatedBySupportActivated_NeverResolves_ButStillCostsChakra()
    {
        var game = CreateGame();
        EnterCutInWindow(game, priorityPlayerId: "p2");
        // p2 (the defender) activates a support that would bounce one of p1's characters.
        AddSupportZoneCard(game, playerIndex: 1, instanceId: "support-1", definitionId: "destroy-support-attack");
        AddBattlefieldCard(game, playerIndex: 0, instanceId: "enemy-1", definitionId: "filler");
        game.State.Players[1].ResourcePool = 5;

        // p1 answers with a Support Activated negate (N-009 shape: negate, then lose 2 life).
        AddSupportZoneCard(game, playerIndex: 0, instanceId: "negate-1", definitionId: "negate-support");
        game.State.Players[0].ResourcePool = 5;

        var executor = CreateSequentialExecutor();

        ExecuteSupport(
            game,
            playerId: "p2",
            instanceId: "support-1",
            executor,
            selectedTargets: [CharacterTarget("p1", "enemy-1")]);

        var stackEntry = game.State.EffectResolutionStack.Single();
        var targetsResponse = GetSupportTargets(game, playerId: "p1", instanceId: "negate-1");
        Assert.IsTrue(targetsResponse.IsEnabled, targetsResponse.DisabledReason);
        Assert.AreEqual(1, targetsResponse.ValidTargets.Count);
        Assert.IsTrue(targetsResponse.ValidTargets[0].IsEffectResolutionStackTarget);
        Assert.AreEqual(stackEntry.EntryId, targetsResponse.ValidTargets[0].EffectResolutionEntryId);
        Assert.AreEqual("support-1", targetsResponse.ValidTargets[0].CardInstanceId);

        ExecuteSupport(
            game,
            playerId: "p1",
            instanceId: "negate-1",
            executor,
            selectedTargets: [targetsResponse.ValidTargets[0]]);

        var startingLife = game.State.Players[0].LeaderCardInstance!.CurrentLife;

        PassInActionStep(game, "p2", executor);
        PassInActionStep(game, "p1", executor);

        Assert.AreEqual(0, game.State.EffectResolutionStack.Count);
        // The negated support never bounced the character, the negate's own follow-up did happen, and
        // both activations paid their cost (negation does not refund).
        Assert.AreEqual(1, game.State.Players[0].Battlefield.Count);
        Assert.AreEqual(startingLife - 2, game.State.Players[0].LeaderCardInstance!.CurrentLife);
        // Both activations cost 1 chakra and negation refunds nothing.
        Assert.AreEqual(4, game.State.Players[0].ResourcePool);
        Assert.AreEqual(4, game.State.Players[1].ResourcePool);
    }

    private InMemoryGameInstanceRegistry registry = null!;

    [TestInitialize]
    public void SetUp()
    {
        registry = new InMemoryGameInstanceRegistry(
            new GameInstanceFactory(),
            new global::ProjectHiddenVillage.Server.Engine.GamePhaseService(
                new global::ProjectHiddenVillage.Server.Engine.GamePhaseStateService()));
    }

    private GameInstance CreateGame()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["leader-def", "filler"] },
                new Player { Id = "p2", Deck = ["leader-def", "filler"] },
            ],
            cardDefinitions: BuildDefinitions(),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        return game;
    }

    private static IReadOnlyList<IGameCardEffect> BuildEffects()
    {
        var effectSpecResolver = new GameRuntimeEffectSpecResolver();
        var targetResolver = new EffectTargetResolver();

        return
        [
            new NoopGameCardEffect(),
            new DestroyCardEffect(effectSpecResolver, CanExecuteEvaluator, targetResolver),
            new NegateCardEffect(effectSpecResolver, CanExecuteEvaluator, new GameValidTargetResultFactory()),
            new ModifyAttributeEffect(effectSpecResolver, CanExecuteEvaluator, targetResolver),
        ];
    }

    private static IGameSequentialEffectExecutor CreateSequentialExecutor()
    {
        return new GameSequentialEffectExecutor(new GameCardEffectRegistry(BuildEffects()));
    }

    /// <summary>
    /// Opens the support cut-in window for an attack declared by p1: priority sits with the player who
    /// may respond, and p2 is the defender (so "During Your Opponent's Attack" supports are legal).
    /// </summary>
    private void EnterCutInWindow(GameInstance game, string priorityPlayerId)
    {
        game.State.Phase = GamePhase.ActionStep;
        game.State.ActivePlayerId = "p1";
        game.State.PriorityPlayerId = priorityPlayerId;
        game.State.HasPendingAttack = true;
        game.State.TurnNumber = 2;
    }

    private void ExecuteSupport(
        GameInstance game,
        string playerId,
        string instanceId,
        IGameSequentialEffectExecutor executor,
        IReadOnlyList<GameEffectTargetReference>? selectedTargets = null)
    {
        registry.ExecuteCardAction(
            game.Id,
            new GameCardActionExecutionRequest(
                PlayerId: playerId,
                ActionId: $"activate-support:{instanceId}",
                SourceCardInstanceId: instanceId,
                SelectedTargets: selectedTargets is null ? null : [.. selectedTargets]),
            executor);
    }

    private void PassInActionStep(GameInstance game, string playerId, IGameSequentialEffectExecutor executor)
    {
        registry.DeclarePassInActionStep(
            game.Id,
            playerId,
            reactiveEffectOrchestrator: null,
            sequentialEffectExecutor: executor);
    }

    private GameCardActionTargetsResponse GetSupportTargets(GameInstance game, string playerId, string instanceId)
    {
        return registry.GetCardActionTargets(
            game.Id,
            new GameCardActionTargetsRequest(
                PlayerId: playerId,
                ActionId: $"activate-support:{instanceId}",
                SourceCardInstanceId: instanceId),
            CanExecuteEvaluator,
            new GameCardEffectRegistry(BuildEffects()));
    }

    private static GameEffectTargetReference CharacterTarget(string playerId, string instanceId)
    {
        return new GameEffectTargetReference(playerId, PlayerZone.CharacterField, instanceId);
    }

    private static void AddHandCard(GameInstance game, int playerIndex, string instanceId, string definitionId)
    {
        game.State.Players[playerIndex].Hand.Add(BuildCardInstance(game, playerIndex, instanceId, definitionId));
    }

    private static void AddSupportZoneCard(GameInstance game, int playerIndex, string instanceId, string definitionId)
    {
        game.State.Players[playerIndex].SupportZone.Add(BuildCardInstance(game, playerIndex, instanceId, definitionId));
    }

    private static void AddBattlefieldCard(GameInstance game, int playerIndex, string instanceId, string definitionId)
    {
        game.State.Players[playerIndex].Battlefield.Add(BuildCardInstance(game, playerIndex, instanceId, definitionId));
    }

    private static CardInstance BuildCardInstance(GameInstance game, int playerIndex, string instanceId, string definitionId)
    {
        var playerId = game.State.Players[playerIndex].PlayerId;
        return new CardInstance
        {
            InstanceId = instanceId,
            CardDefinitionId = definitionId,
            OwnerPlayerId = playerId,
            ControllerPlayerId = playerId,
        };
    }

    [TestMethod]
    public void MainPhase_DoesNotAutoEnd_WhenAnActivatableSetSupportRemains()
    {
        var game = CreateMainPhaseGameWithSetSupport(defenderSupportDefinitionId: "destroy-support");

        registry.ExecuteCardAction(
            game.Id,
            new GameCardActionExecutionRequest(
                PlayerId: "p1",
                ActionId: "summon-to-field:hand-1",
                SourceCardInstanceId: "hand-1"),
            CreateSequentialExecutor());

        // Summoning was the last hand play and nothing can attack this turn (turn 1, summon sickness),
        // so the set support is the only remaining action and MainPhase must stay open.
        Assert.AreEqual(GamePhase.MainPhase, game.State.Phase);
    }

    [TestMethod]
    public void MainPhase_AutoEnds_WhenTheSetSupportTimingIsClosed()
    {
        // A During Your Opponent's Attack support is illegal during your own MainPhase.
        var game = CreateMainPhaseGameWithSetSupport(defenderSupportDefinitionId: "destroy-support-attack");

        registry.ExecuteCardAction(
            game.Id,
            new GameCardActionExecutionRequest(
                PlayerId: "p1",
                ActionId: "summon-to-field:hand-1",
                SourceCardInstanceId: "hand-1"),
            CreateSequentialExecutor());

        Assert.AreNotEqual(GamePhase.MainPhase, game.State.Phase);
    }

    [TestMethod]
    public void GetSupportTargets_PublishesChoiceRangeSupport_ForTheMultiPickSelection()
    {
        // N-006/N-017 shape: "Choose up to 2 rested Characters: K.O. the chosen cards." - the range is
        // playable now that the board can toggle candidates and confirm, so the plan must publish the
        // candidates plus the server-declared counts instead of a disabled reason.
        var game = CreateGame();
        EnterCutInWindow(game, priorityPlayerId: "p2");
        AddSupportZoneCard(game, playerIndex: 1, instanceId: "support-1", definitionId: "destroy-two-support");
        AddBattlefieldCard(game, playerIndex: 0, instanceId: "enemy-1", definitionId: "filler");
        AddBattlefieldCard(game, playerIndex: 0, instanceId: "enemy-2", definitionId: "filler");
        game.State.Players[1].ResourcePool = 5;

        var targetsResponse = GetSupportTargets(game, playerId: "p2", instanceId: "support-1");

        Assert.IsTrue(targetsResponse.IsEnabled, targetsResponse.DisabledReason);
        Assert.IsNull(targetsResponse.MinimumTargetCount);
        Assert.AreEqual(2, targetsResponse.MaximumTargetCount);
        Assert.AreEqual(2, targetsResponse.ValidTargets.Count);
    }

    private GameInstance CreateMainPhaseGameWithSetSupport(string defenderSupportDefinitionId)
    {
        var game = CreateGame();
        game.State.Phase = GamePhase.MainPhase;
        game.State.ActivePlayerId = "p1";
        game.State.PriorityPlayerId = "p1";
        game.State.TurnNumber = 1;
        // Battle legality uses the active player's TurnCount for the "no attacking on the first turn"
        // rule, so both players need a turn count outside the attack window for this fixture.
        game.State.Players[0].TurnCount = 1;
        game.State.Players[1].TurnCount = 1;
        game.State.SetSummonCardReady("p1", true);
        game.State.Players[0].ResourcePool = 5;
        // The dealt hands would keep MainPhase open on their own; the test needs the hand to be empty
        // after the single summon so the set support is genuinely the last legal action.
        game.State.Players[0].Hand.Clear();
        game.State.Players[1].Hand.Clear();
        AddHandCard(game, playerIndex: 0, instanceId: "hand-1", definitionId: "filler");
        AddSupportZoneCard(game, playerIndex: 0, instanceId: "support-1", definitionId: defenderSupportDefinitionId);
        AddBattlefieldCard(game, playerIndex: 1, instanceId: "enemy-1", definitionId: "filler");
        return game;
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
                Color = CardColor.Red,
                Traits = ["Leader"],
                Description = string.Empty,
                Damage = 1,
                Power = 3,
                Life = 10,
            },
            ["filler"] = new CharacterCard
            {
                Id = "filler",
                DisplayName = "Filler",
                Name = ["Filler"],
                Type = CardType.Character,
                Color = CardColor.Red,
                Traits = [],
                Description = string.Empty,
                Damage = 1,
                Power = 1,
                Health = 5,
            },
            ["destroy-support"] = BuildDestroySupport("destroy-support", EffectTiming.ActivateMain, chakraCost: 2),
            ["destroy-support-attack"] = BuildDestroySupport(
                "destroy-support-attack",
                EffectTiming.DuringOpponentAttack,
                chakraCost: 1),
            ["negate-support"] = BuildNegateSupport(),
            ["destroy-two-support"] = BuildDestroyTwoSupport(),
        };
    }

    /// <summary>N-006/N-017 shape: "[During Your Opponent's Attack] Choose up to 2 rested Characters: K.O."</summary>
    private static CharacterCard BuildDestroyTwoSupport()
    {
        return new CharacterCard
        {
            Id = "destroy-two-support",
            DisplayName = "Destroy Two Support",
            Name = ["Destroy Two Support"],
            Type = CardType.Character,
            Color = CardColor.Red,
            Traits = [],
            Description = string.Empty,
            Damage = 1,
            Power = 1,
            Health = 5,
            SupportName = "Fire Style: Toad Flame Bombs",
            SupportEffect = "[During Your Opponent's Attack] Choose up to 2 rested Characters: K.O. the chosen cards.",
            Effects =
            [
                new EffectSpec
                {
                    Id = "KO-rested-cards",
                    RuntimeEffectType = RuntimeEffects.DestroyCard,
                    EffectType = EffectKind.Support,
                    Timing = EffectTiming.DuringOpponentAttack,
                    ChakraCost = 2,
                    ExecutionTargetSource = EffectExecutionTargetSource.SelectedTargets,
                    TargetRules = new EffectTargetRuleSet
                    {
                        MaximumTargetCount = 2,
                        Rules =
                        [
                            new EffectTargetRule
                            {
                                Scope = EffectTargetRange.Any,
                                InZone = PlayerZone.CharacterField,
                                MaximumSelectedTargetCount = 2,
                            },
                        ],
                    },
                },
            ],
        };
    }

    private static CharacterCard BuildDestroySupport(string id, EffectTiming timing, int chakraCost)
    {
        return new CharacterCard
        {
            Id = id,
            DisplayName = "Destroy Support",
            Name = ["Destroy Support"],
            Type = CardType.Character,
            Color = CardColor.Red,
            Traits = [],
            Description = string.Empty,
            Damage = 1,
            Power = 1,
            Health = 5,
            SupportName = "Destroy Jutsu",
            SupportEffect = "[Support] Destroy 1 Character.",
            Effects =
            [
                new EffectSpec
                {
                    Id = "destroy-one",
                    RuntimeEffectType = RuntimeEffects.DestroyCard,
                    EffectType = EffectKind.Support,
                    Timing = timing,
                    ChakraCost = chakraCost,
                    ExecutionTargetSource = EffectExecutionTargetSource.SelectedTargets,
                    TargetRules = new EffectTargetRuleSet
                    {
                        ExactTargetCount = 1,
                        Rules =
                        [
                            new EffectTargetRule
                            {
                                Scope = EffectTargetRange.Any,
                                InZone = PlayerZone.CharacterField,
                                ExactSelectedTargetCount = 1,
                            },
                        ],
                    },
                },
            ],
        };
    }

    /// <summary>N-009 shape: "[Support Activated] Negate that card. Then, reduce your life by 2."</summary>
    private static CharacterCard BuildNegateSupport()
    {
        return new CharacterCard
        {
            Id = "negate-support",
            DisplayName = "Negate Support",
            Name = ["Negate Support"],
            Type = CardType.Character,
            Color = CardColor.Red,
            Traits = [],
            Description = string.Empty,
            Damage = 1,
            Power = 1,
            Health = 5,
            SupportName = "Negate Jutsu",
            SupportEffect = "[Support Activated] Negate that card. Then, reduce your life by 2.",
            Effects =
            [
                // Declared first on purpose: the planner must start at the negate that branches to it.
                new EffectSpec
                {
                    Id = "lose-life",
                    RuntimeEffectType = RuntimeEffects.ChangeValues,
                    EffectType = EffectKind.Support,
                    Timing = EffectTiming.SupportActivated,
                    ChakraCost = 1,
                    ExecutionTargetSource = EffectExecutionTargetSource.SelectedTargets,
                    AttributeModifications =
                    [
                        new AttributeModificationSpec
                        {
                            TargetType = AttributeModificationTargetType.Leader,
                            TargetRange = EffectTargetRange.Self,
                            Attribute = EffectAttributeType.LeaderCurrentLife,
                            Operation = AttributeModificationOperation.Subtract,
                            Value = 2,
                        },
                    ],
                    TargetRules = new EffectTargetRuleSet
                    {
                        ExactTargetCount = 1,
                        Rules =
                        [
                            new EffectTargetRule
                            {
                                Scope = EffectTargetRange.Self,
                                InZone = PlayerZone.Leader,
                                ExactSelectedTargetCount = 0,
                            },
                        ],
                    },
                },
                new EffectSpec
                {
                    Id = "negate-effect",
                    RuntimeEffectType = RuntimeEffects.NegateEffect,
                    EffectType = EffectKind.Support,
                    Timing = EffectTiming.SupportActivated,
                    ChakraCost = 1,
                    OnSuccessEffectId = "lose-life",
                    ExecutionTargetSource = EffectExecutionTargetSource.SelectedTargets,
                    TargetRules = new EffectTargetRuleSet
                    {
                        ExactTargetCount = 1,
                        Rules =
                        [
                            new EffectTargetRule
                            {
                                Scope = EffectTargetRange.Any,
                                InZone = PlayerZone.SupportZone,
                                ExactSelectedTargetCount = 1,
                            },
                        ],
                    },
                },
            ],
        };
    }

    private sealed class FixedIndexRandom(int fixedIndex) : Random
    {
        public override int Next(int maxValue)
        {
            if (maxValue <= 0)
            {
                throw new ArgumentOutOfRangeException(nameof(maxValue), "maxValue must be positive.");
            }

            return fixedIndex % maxValue;
        }
    }
}
