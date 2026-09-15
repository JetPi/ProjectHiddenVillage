using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// Verifies support activation normalisation on the real card shapes. Both rules exist because the
/// ingestion orders/flags effects mechanically: N-010 authors "summon this card" as a target-pick rule and
/// N-009 authors its life cost on a node the player never selects.
/// </summary>
[TestClass]
public sealed class SupportActivationNormalizerTests
{
    [TestMethod]
    public void NormalizeForActivation_TreatsSelfSummonAsSourceSupplied_AndOwnLeaderModificationAsSelectionFree()
    {
        // N-010 (Karin) shape: gain 2 life, then summon this card from the support area.
        var definition = BuildN010ShapedDefinition();
        var sourceInstance = new CardInstance
        {
            InstanceId = "support-1",
            CardDefinitionId = definition.Id,
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
        };

        var normalized = SupportActivationNormalizer.NormalizeForActivation(
            BuildState(),
            definition,
            sourceInstance);

        var summonNode = normalized.Effects.Single(effect => effect.Id == "summon-self");
        Assert.AreEqual(EffectExecutionTargetSource.SourceCard, summonNode.ExecutionTargetSource);
        Assert.AreEqual(0, summonNode.TargetRules.Rules.Count);
        Assert.IsFalse(summonNode.TargetRules.ExactTargetCount.HasValue);

        var lifeNode = normalized.Effects.Single(effect => effect.Id == "gain-health");
        Assert.AreEqual(EffectExecutionTargetSource.None, lifeNode.ExecutionTargetSource);
        Assert.AreEqual(0, lifeNode.TargetRules.Rules.Count);
        Assert.IsFalse(lifeNode.TargetRules.ExactTargetCount.HasValue);

        // The shared catalogue definition must not be touched.
        var originalSummonNode = definition.Effects.Single(effect => effect.Id == "summon-self");
        Assert.AreEqual(EffectExecutionTargetSource.SelectedTargets, originalSummonNode.ExecutionTargetSource);
        Assert.AreEqual(1, originalSummonNode.TargetRules.Rules.Count);
    }

    [TestMethod]
    public void NormalizeForActivation_KeepsTargetSelection_WhenTheSummonRuleDescribesAnotherCard()
    {
        var definition = new CharacterCard
        {
            Id = "summon-other-support",
            DisplayName = "Summon Other",
            Type = CardType.Character,
            SupportName = "Summon Other",
            SupportEffect = "[Support] Summon 1 other Character from your hand.",
            Effects =
            [
                new EffectSpec
                {
                    Id = "summon-other",
                    RuntimeEffectType = RuntimeEffects.SummonCard,
                    EffectType = EffectKind.Support,
                    Timing = EffectTiming.DuringYourMain,
                    ChakraCost = 1,
                    ExecutionTargetSource = EffectExecutionTargetSource.SelectedTargets,
                    TargetRules = new EffectTargetRuleSet
                    {
                        ExactTargetCount = 1,
                        Rules =
                        [
                            new EffectTargetRule
                            {
                                Scope = EffectTargetRange.Self,
                                InZone = PlayerZone.Hand,
                                TributeRole = TributeTargetRole.SummonCandidate,
                                ExactSelectedTargetCount = 1,
                                Restriction = new ZoneCardRestriction
                                {
                                    Predicates =
                                    [
                                        new ZoneCardPropertyPredicate
                                        {
                                            Property = ZoneCardProperty.Name,
                                            Operator = ZoneCardPredicateOperator.Equals,
                                            Value = "Someone Else",
                                            IgnoreCase = true,
                                        },
                                    ],
                                },
                            },
                        ],
                    },
                },
            ],
        };

        var sourceInstance = new CardInstance
        {
            InstanceId = "support-1",
            CardDefinitionId = definition.Id,
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
        };

        var normalized = SupportActivationNormalizer.NormalizeForActivation(
            BuildState(),
            definition,
            sourceInstance);

        var summonNode = normalized.Effects.Single(effect => effect.Id == "summon-other");
        Assert.AreEqual(EffectExecutionTargetSource.SelectedTargets, summonNode.ExecutionTargetSource);
        Assert.AreEqual(1, summonNode.TargetRules.Rules.Count);
        Assert.AreEqual(1, summonNode.TargetRules.ExactTargetCount);
    }

    private static CharacterCard BuildN010ShapedDefinition()
    {
        return new CharacterCard
        {
            Id = "N-010-shape",
            DisplayName = "Karin",
            Type = CardType.Character,
            SupportName = "Hurry up and bite me!",
            SupportEffect = "[During Your Opponent's Attack] Summon this card and you gain 2 Life.",
            Effects =
            [
                new EffectSpec
                {
                    Id = "gain-health",
                    RuntimeEffectType = RuntimeEffects.ChangeValues,
                    EffectType = EffectKind.Support,
                    Timing = EffectTiming.DuringOpponentAttack,
                    ChakraCost = 1,
                    OnSuccessEffectId = "summon-self",
                    ExecutionTargetSource = EffectExecutionTargetSource.SelectedTargets,
                    AttributeModifications =
                    [
                        new AttributeModificationSpec
                        {
                            TargetType = AttributeModificationTargetType.Leader,
                            TargetRange = EffectTargetRange.Self,
                            Attribute = EffectAttributeType.LeaderCurrentLife,
                            Operation = AttributeModificationOperation.Add,
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
                                ExactSelectedTargetCount = 1,
                            },
                        ],
                    },
                },
                new EffectSpec
                {
                    Id = "summon-self",
                    IsSubordinate = true,
                    RuntimeEffectType = RuntimeEffects.SummonCard,
                    EffectType = EffectKind.Support,
                    Timing = EffectTiming.DuringOpponentAttack,
                    ExecutionTargetSource = EffectExecutionTargetSource.SelectedTargets,
                    TargetRules = new EffectTargetRuleSet
                    {
                        ExactTargetCount = 1,
                        Rules =
                        [
                            new EffectTargetRule
                            {
                                Scope = EffectTargetRange.Self,
                                InZone = PlayerZone.SupportZone,
                                TributeRole = TributeTargetRole.SummonCandidate,
                                ExactSelectedTargetCount = 1,
                            },
                        ],
                    },
                },
            ],
        };
    }

    private static GameState BuildState()
    {
        return new GameState
        {
            GameId = "game-normalizer",
            ActivePlayerId = "p1",
            PriorityPlayerId = "p1",
            Phase = GamePhase.ActionStep,
            HasPendingAttack = true,
            Players =
            [
                new PlayerState { PlayerId = "p1" },
                new PlayerState { PlayerId = "p2" },
            ],
        };
    }
}
