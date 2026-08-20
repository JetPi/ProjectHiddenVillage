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
                                            Property = "type",
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
                                            Property = "type",
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
}
