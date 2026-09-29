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
            new ModifyAttributeEffect(effectSpecResolver, canExecuteEvaluator, targetResolver),
        ]));
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
            ["tribute-summon-def"] = CreateTributeSummonDefinition(),
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
