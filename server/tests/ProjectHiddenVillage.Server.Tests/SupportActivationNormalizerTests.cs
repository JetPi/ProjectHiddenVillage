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

    [TestMethod]
    public void NormalizeForActivation_TreatsPlayerScopedChakraLockAsSelectionFree()
    {
        // N-016's chakra lock is authored as a target-pick node that declares no target rules at all, which
        // used to make the whole activation unplayable ("No valid targets available."). The lock's audience
        // is its TargetRange, so the node must reach the executor selection-free.
        var definition = BuildChakraLockDefinition(RuntimeEffects.LockChakraRecovery);
        var sourceInstance = new CardInstance
        {
            InstanceId = "support-1",
            CardDefinitionId = definition.Id,
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
        };

        var normalized = SupportActivationNormalizer.NormalizeForActivation(BuildState(), definition, sourceInstance);

        var lockNode = normalized.Effects.Single(effect => effect.Id == "chakra-freeze");
        Assert.AreEqual(EffectExecutionTargetSource.None, lockNode.ExecutionTargetSource);
        Assert.AreEqual(0, lockNode.TargetRules.Rules.Count);

        // The negate beside it keeps its single pick.
        var negateNode = normalized.Effects.Single(effect => effect.Id == "negate-effect");
        Assert.AreEqual(EffectExecutionTargetSource.SelectedTargets, negateNode.ExecutionTargetSource);
        Assert.AreEqual(1, negateNode.TargetRules.Rules.Count);

        // The shared catalogue definition is never mutated.
        var originalLockNode = definition.Effects.Single(effect => effect.Id == "chakra-freeze");
        Assert.AreEqual(EffectExecutionTargetSource.SelectedTargets, originalLockNode.ExecutionTargetSource);
    }

    [TestMethod]
    public void NormalizeForActivation_TreatsSelfScopedFaceStateLockNodeAsSelectionFree()
    {
        // The shape N-016 shipped with before the chakra lock had its own runtime effect: Alter Resources
        // carrying a self-scoped face-state lock, marked Selected Targets without any target rules.
        var definition = BuildChakraLockDefinition(RuntimeEffects.AlterResources);
        var sourceInstance = new CardInstance
        {
            InstanceId = "support-1",
            CardDefinitionId = definition.Id,
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
        };

        var normalized = SupportActivationNormalizer.NormalizeForActivation(BuildState(), definition, sourceInstance);

        var lockNode = normalized.Effects.Single(effect => effect.Id == "chakra-freeze");
        Assert.AreEqual(EffectExecutionTargetSource.None, lockNode.ExecutionTargetSource);
        Assert.AreEqual(0, lockNode.TargetRules.Rules.Count);
    }

    /// <summary>
    /// N-016 shape: "[Support Activated] Negate that card. Then, you cannot turn your CHAKRA face-up." The
    /// lock node is deliberately authored the way the ingestion wrote it: <c>Selected Targets</c> with no
    /// target rules.
    /// </summary>
    private static CharacterCard BuildChakraLockDefinition(RuntimeEffects lockRuntimeEffect)
    {
        return new CharacterCard
        {
            Id = "chakra-lock-support",
            DisplayName = "Chakra Lock Support",
            Name = ["Chakra Lock Support"],
            Type = CardType.Character,
            Color = CardColor.Blue,
            Traits = [],
            Description = string.Empty,
            Damage = 1,
            Power = 5,
            Health = 6,
            SupportName = "Koto Amatsukami",
            SupportEffect = "[Support Activated] Negate that card. Then, you cannot turn your CHAKRA face-up.",
            Effects =
            [
                new EffectSpec
                {
                    Id = "chakra-freeze",
                    RuntimeEffectType = lockRuntimeEffect,
                    EffectType = EffectKind.Support,
                    Timing = EffectTiming.SupportActivated,
                    DurationMode = EffectDurationMode.UntilTheEndOfYourNextTurn,
                    TargetRange = EffectTargetRange.Self,
                    ExecutionTargetSource = EffectExecutionTargetSource.SelectedTargets,
                    FaceStateLocks = lockRuntimeEffect == RuntimeEffects.AlterResources
                        ?
                        [
                            new FaceStateLockSpec
                            {
                                TargetCategory = FaceStateTargetCategory.ChakraCard,
                                Operation = FaceStateLockOperation.CannotTurnFaceUp,
                                TargetRange = EffectTargetRange.Self,
                            }
                        ]
                        : [],
                    TargetRules = new EffectTargetRuleSet(),
                },
                new EffectSpec
                {
                    Id = "negate-effect",
                    RuntimeEffectType = RuntimeEffects.NegateEffect,
                    EffectType = EffectKind.Support,
                    Timing = EffectTiming.SupportActivated,
                    ChakraCost = 1,
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
