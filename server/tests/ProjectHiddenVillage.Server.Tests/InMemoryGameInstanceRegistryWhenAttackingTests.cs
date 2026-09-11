using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;
using ProjectHiddenVillage.Server.Engine;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// Covers the "When Attacking" (On Attack) step of a battle action. Effects that the engine or the UI
/// cannot process yet used to throw *after* the attacker was already rested, leaving the game in
/// MainPhase with a pending attack and no state notification - which froze both clients. These tests
/// pin the attack always completing and unsupported effects being recorded instead of fatal.
/// </summary>
[TestClass]
public sealed class InMemoryGameInstanceRegistryWhenAttackingTests
{
    private readonly InMemoryGameInstanceRegistry registry = new(
        new GameInstanceFactory(),
        new GamePhaseService(new GamePhaseStateService()));

    [TestMethod]
    public void ExecuteCardAction_BattleAction_WithChainedWhenAttackingEffect_CompletesTheAttack()
    {
        var game = CreateGame(attackerDefinitionId: "attacker-def");
        AddAttacker(game, "attacker-def");

        var deckCountBefore = game.State.Players[0].Deck.Count;
        var battlefieldCountBefore = game.State.Players[0].Battlefield.Count;

        registry.ExecuteCardAction(game.Id, CreateBattleActionRequest(game), CreateSequentialExecutor());

        AssertAttackCompleted(game);
        Assert.AreEqual(0, CountSkippedWhenAttackingEntries(game));

        // The chain revealed the top card of the deck ("Reveal First") and then summoned that revealed
        // card to the character field, which only works when the revealed card is handed to the
        // follow-up step as its target.
        Assert.AreEqual(deckCountBefore - 1, game.State.Players[0].Deck.Count);
        Assert.AreEqual(battlefieldCountBefore + 1, game.State.Players[0].Battlefield.Count);
        Assert.IsTrue(game.State.Players[0].Battlefield.Any(card => card.CardDefinitionId == "card-1"));
    }

    [TestMethod]
    public void ExecuteCardAction_BattleAction_WithBrokenWhenAttackingChain_CompletesTheAttackAndRecordsTheSkip()
    {
        var game = CreateGame(attackerDefinitionId: "attacker-def-broken-chain");
        AddAttacker(game, "attacker-def-broken-chain");

        registry.ExecuteCardAction(game.Id, CreateBattleActionRequest(game), CreateSequentialExecutor());

        AssertAttackCompleted(game);
        Assert.AreEqual(1, CountSkippedWhenAttackingEntries(game));
    }

    [TestMethod]
    public void ExecuteCardAction_OptionalWhenAttackingChoice_WithBrokenChain_StillEntersTheCutInWindow()
    {
        var game = CreateGame(attackerDefinitionId: "attacker-def-optional-broken");
        AddAttacker(game, "attacker-def-optional-broken");

        registry.ExecuteCardAction(game.Id, CreateBattleActionRequest(game), CreateSequentialExecutor());

        Assert.AreEqual(GamePhase.AttackDeclaration, game.State.Phase);

        registry.ExecuteCardAction(
            game.Id,
            new GameCardActionExecutionRequest(
                PlayerId: "p1",
                ActionId: "resolve-optional-attack-effect:attacker-1:yes",
                SourceCardInstanceId: "attacker-1"),
            CreateSequentialExecutor());

        AssertAttackCompleted(game);
        Assert.AreEqual(1, CountSkippedWhenAttackingEntries(game));
    }

    [TestMethod]
    public void ExecuteCardAction_BattleAction_WhenRevealedCardMatchesThePostCondition_SummonsIt()
    {
        var game = CreateGame(attackerDefinitionId: "attacker-def-postcondition-match");
        AddAttacker(game, "attacker-def-postcondition-match");

        var deckCountBefore = game.State.Players[0].Deck.Count;

        registry.ExecuteCardAction(game.Id, CreateBattleActionRequest(game), CreateSequentialExecutor());

        AssertAttackCompleted(game);
        Assert.AreEqual(0, CountSkippedWhenAttackingEntries(game));
        Assert.AreEqual(deckCountBefore - 1, game.State.Players[0].Deck.Count);
        Assert.IsTrue(game.State.Players[0].Battlefield.Any(card => card.CardDefinitionId == "card-1"));
    }

    [TestMethod]
    public void ExecuteCardAction_BattleAction_WhenRevealedCardFailsThePostCondition_OnlyReveals()
    {
        var game = CreateGame(attackerDefinitionId: "attacker-def-postcondition-mismatch");
        AddAttacker(game, "attacker-def-postcondition-mismatch");

        var deckCountBefore = game.State.Players[0].Deck.Count;
        var battlefieldCountBefore = game.State.Players[0].Battlefield.Count;

        registry.ExecuteCardAction(game.Id, CreateBattleActionRequest(game), CreateSequentialExecutor());

        AssertAttackCompleted(game);
        Assert.AreEqual(0, CountSkippedWhenAttackingEntries(game));
        Assert.AreEqual(deckCountBefore, game.State.Players[0].Deck.Count);
        Assert.AreEqual(battlefieldCountBefore, game.State.Players[0].Battlefield.Count);

        // The reveal still happened (the card stays revealed until it changes zone), only the
        // dependent summon is skipped.
        Assert.IsTrue(game.State.Players[0].Deck.Any(card => card.IsRevealedToBothPlayers));
    }

    private static void AssertAttackCompleted(GameInstance game)
    {
        Assert.AreEqual(GamePhase.ActionStep, game.State.Phase);
        Assert.AreEqual("p2", game.State.PriorityPlayerId);
        Assert.IsTrue(game.State.HasPendingAttack);
        Assert.IsTrue(game.State.Players[0].Battlefield[0].IsRested);
    }

    private static int CountSkippedWhenAttackingEntries(GameInstance game)
    {
        return game.ActionLog.Count(entry => entry.ActionType == "when_attacking_effect_skipped");
    }

    private static GameCardActionExecutionRequest CreateBattleActionRequest(GameInstance game)
    {
        return new GameCardActionExecutionRequest(
            PlayerId: "p1",
            ActionId: "battle-action:attacker-1",
            SourceCardInstanceId: "attacker-1",
            SelectedTargets:
            [
                new GameEffectTargetReference(
                    PlayerId: "p2",
                    Zone: PlayerZone.Leader,
                    CardInstanceId: game.State.Players[1].LeaderCardInstance!.InstanceId)
            ]);
    }

    private static void AddAttacker(GameInstance game, string cardDefinitionId)
    {
        game.State.Players[0].Battlefield.Add(new CardInstance
        {
            InstanceId = "attacker-1",
            CardDefinitionId = cardDefinitionId,
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
            IsRested = false,
        });
    }

    private GameInstance CreateGame(string attackerDefinitionId)
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["leader-def", "card-1"] },
                new Player { Id = "p2", Deck = ["leader-def", "card-1"] },
            ],
            cardDefinitions: BuildDefinitions(attackerDefinitionId));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.MainPhase;
        game.State.ActivePlayerId = "p1";
        game.State.PriorityPlayerId = "p1";
        game.State.TurnNumber = 2;

        return game;
    }

    private static IGameSequentialEffectExecutor CreateSequentialExecutor()
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

    private static Dictionary<string, Card> BuildDefinitions(string attackerDefinitionId)
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
            ["card-1"] = new CharacterCard
            {
                Id = "card-1",
                DisplayName = "Filler",
                Name = ["Filler"],
                Type = CardType.Character,
                Color = CardColor.Blue,
                Traits = ["Ninja"],
                Description = string.Empty,
                Damage = 1,
                Power = 1,
                Health = 5,
                Effects = [],
            },
            [attackerDefinitionId] = new CharacterCard
            {
                Id = attackerDefinitionId,
                DisplayName = "Reveal Attacker",
                Name = ["Reveal Attacker"],
                Type = CardType.Character,
                Color = CardColor.Red,
                Traits = ["Ninja"],
                Description = string.Empty,
                Damage = 2,
                Power = 3,
                Health = 5,
                Effects = BuildWhenAttackingEffects(attackerDefinitionId),
            },
        };
    }

    private static List<EffectSpec> BuildWhenAttackingEffects(string attackerDefinitionId)
    {
        return attackerDefinitionId switch
        {
            "attacker-def-broken-chain" =>
            [
                CreateRevealEffect(isOptional: false, onSuccessEffectId: "missing-effect"),
            ],
            "attacker-def-optional-broken" =>
            [
                CreateRevealEffect(isOptional: true, onSuccessEffectId: "missing-effect"),
            ],
            "attacker-def-postcondition-match" =>
            [
                CreateRevealEffect(
                    isOptional: false,
                    onSuccessEffectId: "summon-revealed-card",
                    postCondition: CreateRevealedTypePostCondition("Character")),
                CreateSummonEffect(),
            ],
            "attacker-def-postcondition-mismatch" =>
            [
                CreateRevealEffect(
                    isOptional: false,
                    onSuccessEffectId: "summon-revealed-card",
                    postCondition: CreateRevealedTypePostCondition("Leader")),
                CreateSummonEffect(),
            ],
            _ =>
            [
                CreateRevealEffect(isOptional: false, onSuccessEffectId: "summon-revealed-card"),
                CreateSummonEffect(),
            ],
        };
    }

    private static ZoneCardRestriction CreateRevealedTypePostCondition(string expectedType)
    {
        return new ZoneCardRestriction
        {
            MatchMode = ZoneRestrictionMatchMode.All,
            Predicates =
            [
                new ZoneCardPropertyPredicate
                {
                    Property = ZoneCardProperty.Type,
                    Operator = ZoneCardPredicateOperator.Equals,
                    Value = expectedType,
                    IgnoreCase = true,
                }
            ],
        };
    }

    private static EffectSpec CreateRevealEffect(
        bool isOptional,
        string? onSuccessEffectId,
        ZoneCardRestriction? postCondition = null)
    {
        return new EffectSpec
        {
            Id = "reveal-top",
            RuntimeEffectType = RuntimeEffects.RevealCard,
            EffectType = EffectKind.Activated,
            Timing = EffectTiming.WhenAttacking,
            DurationMode = EffectDurationMode.Instant,
            IsOptional = isOptional,
            OnSuccessEffectId = onSuccessEffectId,
            RevealTimingMode = RevealTimingMode.RevealFirst,
            RevealPostConditionRestriction = postCondition,
            ExecutionTargetSource = EffectExecutionTargetSource.SelectedTargets,
            ExecutionFlowMode = EffectExecutionFlowMode.AtomicChain,
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

    private static EffectSpec CreateSummonEffect()
    {
        return new EffectSpec
        {
            Id = "summon-revealed-card",
            IsSubordinate = true,
            RuntimeEffectType = RuntimeEffects.SummonCard,
            EffectType = EffectKind.Activated,
            Timing = EffectTiming.WhenAttacking,
            DurationMode = EffectDurationMode.Instant,
            ExecutionTargetSource = EffectExecutionTargetSource.SelectedTargets,
            ExecutionFlowMode = EffectExecutionFlowMode.AtomicChain,
            TargetRules = new EffectTargetRuleSet
            {
                Operator = RequirementGroupOperator.Any,
                ExactTargetCount = 1,
                AutoSelectAllValidTargets = false,
                Rules = [],
            },
        };
    }
}
