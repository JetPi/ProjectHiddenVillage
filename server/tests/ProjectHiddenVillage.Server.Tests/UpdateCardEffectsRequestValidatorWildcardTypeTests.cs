using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class UpdateCardEffectsRequestValidatorWildcardTypeTests
{
    [TestMethod]
    public void Validate_AllowsTypeInPredicateWithEmptyValues()
    {
        var validator = new UpdateCardEffectsRequestValidator();
        var request = new UpdateCardEffectsRequest(
            Conditions: null,
            Effects:
            [
                new EffectSpec
                {
                    Id = "effect-wildcard-type",
                    RuntimeEffectType = RuntimeEffects.Tribute,
                    EffectType = EffectKind.SummonRequirement,
                    Timing = EffectTiming.OnSummon,
                    TargetRange = EffectTargetRange.Self,
                    ContextRules = [],
                    TargetRules = new EffectTargetRuleSet
                    {
                        Rules =
                        [
                            new EffectTargetRule
                            {
                                Scope = EffectTargetRange.Self,
                                InZone = PlayerZone.CharacterField,
                                TributeRole = TributeTargetRole.TributeMaterial,
                                Restriction = new ZoneCardRestriction
                                {
                                    Predicates =
                                    [
                                        new ZoneCardPropertyPredicate
                                        {
                                            Property = ZoneCardProperty.Type,
                                            Operator = ZoneCardPredicateOperator.In,
                                            Values = []
                                        }
                                    ]
                                }
                            },
                            new EffectTargetRule
                            {
                                Scope = EffectTargetRange.Self,
                                InZone = PlayerZone.Hand,
                                TributeRole = TributeTargetRole.SummonCandidate,
                                Restriction = new ZoneCardRestriction
                                {
                                    Predicates =
                                    [
                                        new ZoneCardPropertyPredicate
                                        {
                                            Property = ZoneCardProperty.Type,
                                            Operator = ZoneCardPredicateOperator.In,
                                            Values = ["Character"]
                                        }
                                    ]
                                }
                            }
                        ],
                        TributeComposition = new TributeTargetComposition
                        {
                            ExactTributeCount = 1,
                            RequireSingleSummonTarget = true,
                            RequireDistinctSummonAndTributes = true
                        }
                    }
                }
            ],
            Description: null,
            SupportEffect: null,
            CannotBeNormalSummoned: null);

        var result = validator.Validate(request);

        Assert.IsTrue(result.IsValid);
    }

    [TestMethod]
    public void Validate_AllowsSelectedTargetCountWithoutTributeComposition_ForNonTributeRuntimeEffect()
    {
        var validator = new UpdateCardEffectsRequestValidator();
        var request = new UpdateCardEffectsRequest(
            Conditions: null,
            Effects:
            [
                new EffectSpec
                {
                    Id = "effect-summon-card-selected-count",
                    RuntimeEffectType = RuntimeEffects.SummonCard,
                    EffectType = EffectKind.Activated,
                    Timing = EffectTiming.OnSummon,
                    TargetRange = EffectTargetRange.Self,
                    ContextRules = [],
                    TargetRules = new EffectTargetRuleSet
                    {
                        Operator = RequirementGroupOperator.Any,
                        ExactTargetCount = 1,
                        Rules =
                        [
                            new EffectTargetRule
                            {
                                Scope = EffectTargetRange.Self,
                                InZone = PlayerZone.Trash,
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
                                            Value = "Naruto Uzumaki"
                                        }
                                    ]
                                }
                            },
                            new EffectTargetRule
                            {
                                Scope = EffectTargetRange.Self,
                                InZone = PlayerZone.Deck,
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
                                            Value = "Naruto Uzumaki"
                                        }
                                    ],
                                    MatchMode = ZoneRestrictionMatchMode.All
                                }
                            }
                        ],
                        TributeComposition = null,
                    }
                }
            ],
            Description: null,
            SupportEffect: null,
            CannotBeNormalSummoned: null);

        var result = validator.Validate(request);

        Assert.IsTrue(result.IsValid);
    }
}
