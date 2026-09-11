using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;
using ProjectHiddenVillage.Server.Engine;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// Covers cards that carry two mutually exclusive "Gain Effect" variants of the same keyword
/// (for example Minato Namikaze: remove Rush while Power &lt; 10, gain Rush while Power &gt;= 10).
/// The target rules of each variant are the activation condition, so only the matching variant may
/// activate and its consequence must execute its own effect spec.
/// </summary>
[TestClass]
public sealed class GamePassiveKeywordConditionTests
{
    private const string MinatoInstanceId = "minato-1";
    private const string WingmanInstanceId = "wingman-1";

    [TestMethod]
    public void EvaluateAndEnqueue_ActivatesOnlyTheVariantWhoseConditionMatches()
    {
        var game = CreateGameWithConditionalRushSource(power: 10);

        var result = CreatePassiveEffectService().EvaluateAndEnqueue(
            game,
            CreateMutationEvent(),
            new PassiveChainResolutionOptions());

        Assert.IsFalse(result.IsError);

        // Power >= 10 satisfies only the gain variant; the remove variant stays inactive.
        CollectionAssert.AreEquivalent(
            new[] { $"{MinatoInstanceId}:gain-rush" },
            result.Value.ActivatedPassiveKeys.ToArray());
        Assert.AreEqual(0, result.Value.DeactivatedPassiveKeys.Count);

        Assert.AreEqual(1, game.State.EffectResolutionStack.Count);
        var entry = game.State.EffectResolutionStack[0];

        Assert.AreEqual(GainKeywordEffect.EffectKey, entry.EffectTypeKey);
        Assert.AreEqual(MinatoInstanceId, entry.SourceCardInstanceId);

        // Without the pinned spec id the consequence resolves the first GainEffect on the card,
        // which would be the remove variant.
        Assert.AreEqual(
            "gain-rush",
            entry.Arguments[ReactiveEffectExecutionConstants.ActiveEffectSpecIdArgument]);
        Assert.AreEqual(
            MinatoInstanceId,
            entry.Arguments[ReactiveEffectExecutionConstants.ExpectedTriggerTargetIdsArgument]);
    }

    [TestMethod]
    public void Resolve_AppliesRush_SoASummonedCardCanDeclareBattle()
    {
        var game = CreateGameWithConditionalRushSource(power: 10);
        var passiveEffectService = CreatePassiveEffectService();
        var chainResolver = CreateChainResolver();

        Assert.IsFalse(GetBattleAction(game, MinatoInstanceId).IsEnabled);

        var evaluation = passiveEffectService.EvaluateAndEnqueue(
            game,
            CreateMutationEvent(),
            new PassiveChainResolutionOptions());
        Assert.IsFalse(evaluation.IsError);

        var sourceCard = GetBattlefieldCard(game, MinatoInstanceId);
        Assert.IsFalse(sourceCard.RuntimeKeywords.Contains(EffectConditionKeywords.Rush));

        var chainResult = chainResolver.Resolve(game, actingPlayerId: "p1", new PassiveChainResolutionOptions());
        Assert.IsFalse(chainResult.IsError);
        Assert.AreEqual(0, game.State.EffectResolutionStack.Count);

        Assert.IsTrue(sourceCard.RuntimeKeywords.Contains(EffectConditionKeywords.Rush));

        // The Self predicate keeps the keyword on the source card only.
        Assert.IsFalse(GetBattlefieldCard(game, WingmanInstanceId).RuntimeKeywords.Contains(EffectConditionKeywords.Rush));

        var battleAction = GetBattleAction(game, MinatoInstanceId);
        Assert.AreEqual($"battle-action:{MinatoInstanceId}", battleAction.ActionId);
        Assert.IsTrue(battleAction.IsEnabled, battleAction.DisabledReason ?? string.Empty);
    }

    [TestMethod]
    public void Resolve_RemovesRush_WhenPowerDropsBelowThreshold()
    {
        var game = CreateGameWithConditionalRushSource(power: 10);
        var passiveEffectService = CreatePassiveEffectService();
        var chainResolver = CreateChainResolver();

        passiveEffectService.EvaluateAndEnqueue(game, CreateMutationEvent(), new PassiveChainResolutionOptions());
        Assert.IsFalse(chainResolver.Resolve(game, actingPlayerId: "p1", new PassiveChainResolutionOptions()).IsError);

        var sourceCard = GetBattlefieldCard(game, MinatoInstanceId);
        Assert.IsTrue(sourceCard.RuntimeKeywords.Contains(EffectConditionKeywords.Rush));

        sourceCard.PowerOverride = 9;

        var evaluation = passiveEffectService.EvaluateAndEnqueue(
            game,
            CreateMutationEvent(),
            new PassiveChainResolutionOptions());
        Assert.IsFalse(evaluation.IsError);

        CollectionAssert.AreEquivalent(
            new[] { $"{MinatoInstanceId}:remove-rush" },
            evaluation.Value.ActivatedPassiveKeys.ToArray());
        Assert.AreEqual(
            "remove-rush",
            game.State.EffectResolutionStack[0].Arguments[ReactiveEffectExecutionConstants.ActiveEffectSpecIdArgument]);

        Assert.IsFalse(chainResolver.Resolve(game, actingPlayerId: "p1", new PassiveChainResolutionOptions()).IsError);
        Assert.IsFalse(sourceCard.RuntimeKeywords.Contains(EffectConditionKeywords.Rush));
        Assert.IsFalse(GetBattleAction(game, MinatoInstanceId).IsEnabled);
    }

    [TestMethod]
    public void Resolve_AppliesRush_WhenAPowerBoostLiftsTheCardOverTheThreshold()
    {
        var game = CreateGameWithConditionalRushSource(power: 5);
        var sourceCard = GetBattlefieldCard(game, MinatoInstanceId);
        var passiveEffectService = CreatePassiveEffectService();
        var chainResolver = CreateChainResolver();

        // Summon pass: Power 5 only satisfies the remove variant, so the card cannot attack yet.
        passiveEffectService.EvaluateAndEnqueue(game, CreateMutationEvent(), new PassiveChainResolutionOptions());
        Assert.IsFalse(chainResolver.Resolve(game, actingPlayerId: "p1", new PassiveChainResolutionOptions()).IsError);
        Assert.IsFalse(sourceCard.RuntimeKeywords.Contains(EffectConditionKeywords.Rush));
        Assert.IsFalse(GetBattleAction(game, MinatoInstanceId).IsEnabled);

        game.State.AppliedCardEffects.Add(new AppliedCardEffectState
        {
            SourceCardInstanceId = WingmanInstanceId,
            EffectSpecId = "power-boost",
            TargetCardInstanceId = MinatoInstanceId,
            ModifierKind = AppliedCardModifierKind.Attribute,
            DurationMode = EffectDurationMode.DuringThisTurn,
            AttributeType = EffectAttributeType.CardPower,
            AttributeOperation = AttributeModificationOperation.Add,
            AttributeValue = 5,
            AppliedTurnNumber = game.State.TurnNumber,
        });

        var evaluation = passiveEffectService.EvaluateAndEnqueue(
            game,
            CreateMutationEvent(),
            new PassiveChainResolutionOptions());
        Assert.IsFalse(evaluation.IsError);

        CollectionAssert.AreEquivalent(
            new[] { $"{MinatoInstanceId}:gain-rush" },
            evaluation.Value.ActivatedPassiveKeys.ToArray());

        Assert.IsFalse(chainResolver.Resolve(game, actingPlayerId: "p1", new PassiveChainResolutionOptions()).IsError);
        Assert.IsTrue(sourceCard.RuntimeKeywords.Contains(EffectConditionKeywords.Rush));
        Assert.IsTrue(GetBattleAction(game, MinatoInstanceId).IsEnabled);
    }

    [TestMethod]
    public void Sweep_RemovesRush_WhenATemporaryPowerBoostExpiresAtEndStep()
    {
        var game = CreateGameWithConditionalRushSource(power: 5);
        var sourceCard = GetBattlefieldCard(game, MinatoInstanceId);
        var orchestrator = CreateOrchestrator();

        // A "until turn end" boost lifts the card to Power 10, granting Rush.
        game.State.AppliedCardEffects.Add(CreateTemporaryPowerBoost(value: 5));

        Assert.IsFalse(orchestrator
            .ApplyPostMutationEffects(game, CreateMutationEvent(), "p1")
            .IsError);
        Assert.IsTrue(sourceCard.RuntimeKeywords.Contains(EffectConditionKeywords.Rush));

        // End step reverts the boost (Power back to 5) without any effect reporting a mutation.
        game.State.Phase = GamePhase.EndStep;
        Assert.IsTrue(new GamePhaseStateService().CompleteEndStep(game.State));
        Assert.AreEqual(0, game.State.AppliedCardEffects.Count);

        var sweepResult = orchestrator.ApplyPostMutationEffects(
            game,
            CreateMutationEvent(),
            "p1",
            new PassiveChainResolutionOptions { ContinuousPassivesOnly = true });

        Assert.IsFalse(sweepResult.IsError);
        CollectionAssert.AreEquivalent(
            new[] { $"{MinatoInstanceId}:remove-rush" },
            sweepResult.Value.PassiveEvaluation.ActivatedPassiveKeys.ToArray());
        Assert.IsFalse(sourceCard.RuntimeKeywords.Contains(EffectConditionKeywords.Rush));
    }

    [TestMethod]
    public void CompleteEndStep_ReevaluatesContinuousPassives_ForExpiredBoosts()
    {
        var registry = new InMemoryGameInstanceRegistry(
            new GameInstanceFactory(),
            new GamePhaseService(new GamePhaseStateService()));

        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["leader-def"] },
                new Player { Id = "p2", Deck = ["leader-def"] },
            ],
            cardDefinitions: CreateGameWithConditionalRushSource(power: 5).State.CardDefinitions);

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.MainPhase;
        game.State.ActivePlayerId = "p1";
        game.State.PriorityPlayerId = "p1";
        game.State.TurnNumber = 3;

        var sourceCard = new CardInstance
        {
            InstanceId = MinatoInstanceId,
            CardDefinitionId = "minato-def",
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
            EnteredFieldTurnNumber = 3,
        };
        sourceCard.RuntimeKeywords.Add(EffectConditionKeywords.Rush);
        game.State.Players[0].Battlefield.Add(sourceCard);
        game.State.AppliedCardEffects.Add(CreateTemporaryPowerBoost(value: 5));

        game.State.Phase = GamePhase.EndStep;
        registry.CompleteEndStep(game.Id, CreateOrchestrator());

        Assert.AreEqual(0, game.State.AppliedCardEffects.Count);
        Assert.IsFalse(sourceCard.RuntimeKeywords.Contains(EffectConditionKeywords.Rush));
    }

    private static AppliedCardEffectState CreateTemporaryPowerBoost(int value)
    {
        return new AppliedCardEffectState
        {
            SourceCardInstanceId = MinatoInstanceId,
            EffectSpecId = "power-boost",
            TargetCardInstanceId = MinatoInstanceId,
            ModifierKind = AppliedCardModifierKind.Attribute,
            DurationMode = EffectDurationMode.DuringThisTurn,
            AttributeType = EffectAttributeType.CardPower,
            AttributeOperation = AttributeModificationOperation.Add,
            AttributeValue = value,
            AppliedTurnNumber = 3,
        };
    }

    private static GamePassiveEffectService CreatePassiveEffectService()
    {
        return new GamePassiveEffectService(CreateCanExecuteEvaluator());
    }

    private static IGameEffectCanExecuteEvaluator CreateCanExecuteEvaluator()
    {
        return new GameEffectCanExecuteEvaluator(
            new EffectContextConditionEvaluator(),
            new EffectTargetResolver(),
            new GameValidTargetResultFactory(),
            new GameEffectConditionDiagnostics());
    }

    private static GameEffectChainResolver CreateChainResolver()
    {
        return new GameEffectChainResolver(new GameCardEffectRegistry(
        [
            new GainKeywordEffect(
                new GameRuntimeEffectSpecResolver(),
                CreateCanExecuteEvaluator(),
                new EffectTargetResolver())
        ]));
    }

    private static GameReactiveEffectOrchestrator CreateOrchestrator()
    {
        return new GameReactiveEffectOrchestrator(
            new GamePassiveEffectService(CreateCanExecuteEvaluator()),
            CreateChainResolver());
    }

    private static GameInstance CreateGameWithConditionalRushSource(int power)
    {
        var sourceCard = new CardInstance
        {
            InstanceId = MinatoInstanceId,
            CardDefinitionId = "minato-def",
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
            EnteredFieldTurnNumber = 3,
        };

        var wingmanCard = new CardInstance
        {
            InstanceId = WingmanInstanceId,
            CardDefinitionId = "wingman-def",
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
            EnteredFieldTurnNumber = 3,
        };

        var opponentCard = new CardInstance
        {
            InstanceId = "opponent-1",
            CardDefinitionId = "opponent-def",
            OwnerPlayerId = "p2",
            ControllerPlayerId = "p2",
        };
        var state = new GameState
        {
            GameId = "game-1",
            Phase = GamePhase.MainPhase,
            TurnNumber = 3,
            ActivePlayerId = "p1",
            PriorityPlayerId = "p1",
            CardDefinitions =
            {
                ["leader-def"] = new LeaderCard
                {
                    Id = "leader-def",
                    DisplayName = "Leader",
                    Name = ["Leader"],
                    Traits = ["Leader"],
                    Type = CardType.Leader,
                    Color = CardColor.Blue,
                    Life = 5,
                },
                ["minato-def"] = new CharacterCard
                {
                    Id = "minato-def",
                    DisplayName = "Minato Namikaze",
                    Name = ["Minato Namikaze"],
                    Type = CardType.Character,
                    Color = CardColor.Red,
                    Traits = ["Ninja"],
                    Description = string.Empty,
                    Damage = 2,
                    Power = power,
                    Health = 5,
                    Effects =
                    [
                        CreateConditionalRushEffectSpec(
                            effectId: "remove-rush",
                            operation: KeywordModificationOperation.Remove,
                            powerOperator: ZoneCardPredicateOperator.LessThan,
                            powerValue: "10"),
                        CreateConditionalRushEffectSpec(
                            effectId: "gain-rush",
                            operation: KeywordModificationOperation.Add,
                            powerOperator: ZoneCardPredicateOperator.GreaterThanOrEqual,
                            powerValue: "10"),
                    ],
                },
                ["wingman-def"] = CreateCharacterDefinition("wingman-def", "Wingman"),
                ["opponent-def"] = CreateCharacterDefinition("opponent-def", "Opponent"),
            },
            Players =
            [
                new PlayerState
                {
                    PlayerId = "p1",
                    LeaderCardInstance = CreateLeader("p1"),
                    Battlefield = [sourceCard, wingmanCard],
                },
                new PlayerState
                {
                    PlayerId = "p2",
                    LeaderCardInstance = CreateLeader("p2"),
                    Battlefield = [opponentCard],
                },
            ],
        };

        return new GameInstance(state);
    }

    private static EffectSpec CreateConditionalRushEffectSpec(
        string effectId,
        KeywordModificationOperation operation,
        ZoneCardPredicateOperator powerOperator,
        string powerValue)
    {
        return new EffectSpec
        {
            Id = effectId,
            RuntimeEffectType = RuntimeEffects.GainEffect,
            EffectType = EffectKind.Activated,
            Timing = EffectTiming.YourTurn,
            DurationMode = EffectDurationMode.Instant,
            PassiveMode = PassiveMode.Continuous,
            PassiveReevaluation = new PassiveReevaluationSpec
            {
                TriggerKinds = [PassiveTriggerKind.Any],
                Scope = PassiveReevaluationScope.SourceCardOnly,
            },
            PassiveConsequences =
            [
                new PassiveConsequenceSpec
                {
                    ConsequenceEffectTypeKey = GainKeywordEffect.EffectKey,
                    TargetPolicy = PassiveConsequenceTargetPolicy.SourceCard,
                }
            ],
            KeywordModifications =
            [
                new KeywordModificationSpec
                {
                    TargetType = KeywordModificationTargetType.SourceCard,
                    Operation = operation,
                    Keyword = EffectConditionKeywords.Rush,
                }
            ],
            TargetRules = new EffectTargetRuleSet
            {
                Operator = RequirementGroupOperator.All,
                ExactTargetCount = 1,
                Rules =
                [
                    new EffectTargetRule
                    {
                        Scope = EffectTargetRange.Self,
                        InZone = PlayerZone.CharacterField,
                        ExactSelectedTargetCount = 1,
                        Restriction = new ZoneCardRestriction
                        {
                            MatchMode = ZoneRestrictionMatchMode.All,
                            Predicates =
                            [
                                new ZoneCardPropertyPredicate
                                {
                                    Property = ZoneCardProperty.Self,
                                    Operator = ZoneCardPredicateOperator.Equals,
                                    Value = string.Empty,
                                    IgnoreCase = true,
                                },
                                new ZoneCardPropertyPredicate
                                {
                                    Property = ZoneCardProperty.Power,
                                    Operator = powerOperator,
                                    Value = powerValue,
                                    IgnoreCase = true,
                                },
                            ],
                        },
                    }
                ],
            },
        };
    }

    private static CharacterCard CreateCharacterDefinition(string id, string displayName)
    {
        return new CharacterCard
        {
            Id = id,
            DisplayName = displayName,
            Name = [displayName],
            Type = CardType.Character,
            Color = CardColor.Blue,
            Traits = ["Ninja"],
            Description = string.Empty,
            Damage = 1,
            Power = 12,
            Health = 5,
            Effects = [],
        };
    }

    private static LeaderCardInstanceState CreateLeader(string playerId)
    {
        return new LeaderCardInstanceState
        {
            InstanceId = $"leader-{playerId}",
            CardDefinitionId = "leader-def",
            OwnerPlayerId = playerId,
            ControllerPlayerId = playerId,
            Name = "Leader",
            Color = CardColor.Blue,
            Traits = ["Leader"],
            Damage = 0,
            Power = 0,
            TotalLife = 5,
            CurrentLife = 5,
        };
    }

    private static CardInstance GetBattlefieldCard(GameInstance game, string instanceId)
    {
        return game.State.Players
            .SelectMany(player => player.Battlefield)
            .Single(card => string.Equals(card.InstanceId, instanceId, StringComparison.Ordinal));
    }

    private static GameActionOptionResponse GetBattleAction(GameInstance game, string instanceId)
    {
        return GameStateResponseMapper
            .ToGameStateResponse(game.State, "p1")
            .Players.Single(player => player.PlayerId == "p1")
            .CharacterField.Single(card => card.InstanceId == instanceId)
            .AvailableActions.Single();
    }

    private static GameMutationEvent CreateMutationEvent()
    {
        return new GameMutationEvent
        {
            Kind = GameMutationKind.CardStatChanged,
            GameId = "game-1",
            ActingPlayerId = "p1",
            TurnNumber = 3,
            Phase = GamePhase.MainPhase,
            AffectedCardInstanceIds = [],
            AffectedPlayerIds = ["p1"],
        };
    }
}
