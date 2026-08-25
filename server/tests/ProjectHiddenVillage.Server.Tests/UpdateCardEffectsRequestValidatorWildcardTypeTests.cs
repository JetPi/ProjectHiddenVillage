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
                    DurationMode = EffectDurationMode.Instant,
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
                    DurationMode = EffectDurationMode.Instant,
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

    [TestMethod]
    public void Validate_AllowsCoreCardFieldPatch_WhenTypeColorAndHealthAreValid()
    {
        var validator = new UpdateCardEffectsRequestValidator();
        var request = new UpdateCardEffectsRequest(
            Conditions: null,
            Effects: null,
            Description: null,
            SupportEffect: null,
            CannotBeNormalSummoned: null,
            Type: "Summon",
            Color: "N/A",
            Power: 2,
            Damage: 1,
            Life: null,
            Health: 4);

        var result = validator.Validate(request);

        Assert.IsTrue(result.IsValid);
    }

    [TestMethod]
    public void Validate_ReturnsError_WhenLifeAndHealthAreBothProvided()
    {
        var validator = new UpdateCardEffectsRequestValidator();
        var request = new UpdateCardEffectsRequest(
            Conditions: null,
            Effects: null,
            Description: null,
            SupportEffect: null,
            CannotBeNormalSummoned: null,
            Type: "Leader",
            Color: "Red",
            Power: 1,
            Damage: 1,
            Life: 5,
            Health: 2);

        var result = validator.Validate(request);

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(result.Errors.Any(error => error.ErrorMessage.Contains("Life and Health cannot both be provided", StringComparison.Ordinal)));
    }

    [TestMethod]
    public void Validate_AllowsEmptyEffectsArray_WhenProvided()
    {
        var validator = new UpdateCardEffectsRequestValidator();
        var request = new UpdateCardEffectsRequest(
            Conditions: null,
            Effects: [],
            Description: null,
            SupportEffect: null,
            CannotBeNormalSummoned: null,
            Type: null,
            Color: null,
            Power: null,
            Damage: null,
            Life: null,
            Health: null);

        var result = validator.Validate(request);

        Assert.IsTrue(result.IsValid);
    }

    [TestMethod]
    public void Validate_AllowsMoveCardRules_WhenMoveActionsAreWellFormed()
    {
        var validator = new UpdateCardEffectsRequestValidator();
        var request = new UpdateCardEffectsRequest(
            Conditions: null,
            Effects:
            [
                new EffectSpec
                {
                    Id = "effect-move-card-valid",
                    RuntimeEffectType = RuntimeEffects.MoveCard,
                    EffectType = EffectKind.Activated,
                    Timing = EffectTiming.ActivateMain,
                    DurationMode = EffectDurationMode.Instant,
                    TargetRange = EffectTargetRange.Self,
                    ContextRules = [],
                    MoveCardActions =
                    [
                        new MoveCardActionSpec
                        {
                            Operation = MoveCardOperationType.Draw,
                            DrawCount = 2,
                        },
                        new MoveCardActionSpec
                        {
                            Operation = MoveCardOperationType.Move,
                            SourceZone = PlayerZone.Hand,
                            DestinationZone = PlayerZone.Deck,
                            MoveCount = 1,
                            DestinationIndex = 0,
                            DeckPlacement = MoveCardDeckPlacementType.Index,
                            MultiCardOrdering = MoveCardMultiCardOrderingType.SelectedOrder,
                            AllowCrossPlayer = false,
                            DestinationPlayerRange = EffectTargetRange.Self,
                        }
                    ],
                    TargetRules = new EffectTargetRuleSet
                    {
                        Rules = []
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
    public void Validate_ReturnsError_WhenMoveCardRuleHasUnsupportedZone()
    {
        var validator = new UpdateCardEffectsRequestValidator();
        var request = new UpdateCardEffectsRequest(
            Conditions: null,
            Effects:
            [
                new EffectSpec
                {
                    Id = "effect-move-card-invalid-zone",
                    RuntimeEffectType = RuntimeEffects.MoveCard,
                    EffectType = EffectKind.Activated,
                    Timing = EffectTiming.ActivateMain,
                    DurationMode = EffectDurationMode.Instant,
                    TargetRange = EffectTargetRange.Self,
                    ContextRules = [],
                    MoveCardActions =
                    [
                        new MoveCardActionSpec
                        {
                            Operation = MoveCardOperationType.Move,
                            SourceZone = PlayerZone.Hand,
                            DestinationZone = PlayerZone.CharacterField,
                            DestinationPlayerRange = EffectTargetRange.Self,
                        }
                    ],
                    TargetRules = new EffectTargetRuleSet
                    {
                        Rules = []
                    }
                }
            ],
            Description: null,
            SupportEffect: null,
            CannotBeNormalSummoned: null);

        var result = validator.Validate(request);

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(result.Errors.Any(error => error.ErrorMessage.Contains("MoveCard move actions support only Hand, Deck, Trash, and ExileZone zones.", StringComparison.Ordinal)));
    }

    [TestMethod]
    public void Validate_ReturnsError_WhenDeckPlacementIsIndexWithoutDestinationIndex()
    {
        var validator = new UpdateCardEffectsRequestValidator();
        var request = new UpdateCardEffectsRequest(
            Conditions: null,
            Effects:
            [
                new EffectSpec
                {
                    Id = "effect-move-card-index-without-destination-index",
                    RuntimeEffectType = RuntimeEffects.MoveCard,
                    EffectType = EffectKind.Activated,
                    Timing = EffectTiming.ActivateMain,
                    DurationMode = EffectDurationMode.Instant,
                    TargetRange = EffectTargetRange.Self,
                    ContextRules = [],
                    MoveCardActions =
                    [
                        new MoveCardActionSpec
                        {
                            Operation = MoveCardOperationType.Move,
                            SourceZone = PlayerZone.Hand,
                            DestinationZone = PlayerZone.Deck,
                            DeckPlacement = MoveCardDeckPlacementType.Index,
                            DestinationIndex = null,
                            DestinationPlayerRange = EffectTargetRange.Self,
                        }
                    ],
                    TargetRules = new EffectTargetRuleSet
                    {
                        Rules = []
                    }
                }
            ],
            Description: null,
            SupportEffect: null,
            CannotBeNormalSummoned: null);

        var result = validator.Validate(request);

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(result.Errors.Any(error => error.ErrorMessage.Contains("destination index is required", StringComparison.OrdinalIgnoreCase)));
    }

    [TestMethod]
    public void Validate_ReturnsError_WhenMoveCardMoveCountIsNotPositive()
    {
        var validator = new UpdateCardEffectsRequestValidator();
        var request = new UpdateCardEffectsRequest(
            Conditions: null,
            Effects:
            [
                new EffectSpec
                {
                    Id = "effect-move-card-invalid-move-count",
                    RuntimeEffectType = RuntimeEffects.MoveCard,
                    EffectType = EffectKind.Activated,
                    Timing = EffectTiming.ActivateMain,
                    DurationMode = EffectDurationMode.Instant,
                    TargetRange = EffectTargetRange.Self,
                    ContextRules = [],
                    MoveCardActions =
                    [
                        new MoveCardActionSpec
                        {
                            Operation = MoveCardOperationType.Move,
                            SourceZone = PlayerZone.Hand,
                            DestinationZone = PlayerZone.Deck,
                            MoveCount = 0,
                            DeckPlacement = MoveCardDeckPlacementType.Top,
                            DestinationPlayerRange = EffectTargetRange.Self,
                        }
                    ],
                    TargetRules = new EffectTargetRuleSet
                    {
                        Rules = []
                    }
                }
            ],
            Description: null,
            SupportEffect: null,
            CannotBeNormalSummoned: null);

        var result = validator.Validate(request);

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(result.Errors.Any(error => error.ErrorMessage.Contains("positive move count", StringComparison.OrdinalIgnoreCase)));
    }

    [TestMethod]
    public void Validate_ReturnsError_WhenExecutionConditionArgumentKeyIsOutOfRange()
    {
        var validator = new UpdateCardEffectsRequestValidator();
        var request = new UpdateCardEffectsRequest(
            Conditions: null,
            Effects:
            [
                new EffectSpec
                {
                    Id = "effect-invalid-execution-condition-key",
                    RuntimeEffectType = RuntimeEffects.ChangeValues,
                    EffectType = EffectKind.Activated,
                    Timing = EffectTiming.ActivateMain,
                    DurationMode = EffectDurationMode.Instant,
                    TargetRange = EffectTargetRange.Self,
                    ExecutionCondition = new EffectExecutionConditionSpec
                    {
                        ArgumentKey = (EffectExecutionConditionArgumentKey)999,
                        ExpectedValue = "yes",
                        IgnoreCase = true,
                        Negate = false,
                    },
                    ContextRules = [],
                    TargetRules = new EffectTargetRuleSet
                    {
                        Rules = []
                    }
                }
            ],
            Description: null,
            SupportEffect: null,
            CannotBeNormalSummoned: null);

        var result = validator.Validate(request);

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(result.Errors.Any(error => error.ErrorMessage.Contains("Execution condition argument key must be one of:", StringComparison.Ordinal)));
    }

    [TestMethod]
    public void Validate_AllowsBranchTargets_WhenEffectIdsExist()
    {
        var validator = new UpdateCardEffectsRequestValidator();
        var request = new UpdateCardEffectsRequest(
            Conditions: null,
            Effects:
            [
                new EffectSpec
                {
                    Id = "start",
                    RuntimeEffectType = RuntimeEffects.ChangeValues,
                    EffectType = EffectKind.Activated,
                    Timing = EffectTiming.ActivateMain,
                    DurationMode = EffectDurationMode.Instant,
                    TargetRange = EffectTargetRange.Self,
                    OnSuccessEffectId = "next",
                    ContextRules = [],
                    TargetRules = new EffectTargetRuleSet
                    {
                        Rules = []
                    }
                },
                new EffectSpec
                {
                    Id = "next",
                    RuntimeEffectType = RuntimeEffects.DestroyCard,
                    EffectType = EffectKind.Activated,
                    Timing = EffectTiming.ActivateMain,
                    DurationMode = EffectDurationMode.Instant,
                    TargetRange = EffectTargetRange.Self,
                    ContextRules = [],
                    TargetRules = new EffectTargetRuleSet
                    {
                        Rules = []
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
    public void Validate_ReturnsError_WhenBranchTargetDoesNotExist()
    {
        var validator = new UpdateCardEffectsRequestValidator();
        var request = new UpdateCardEffectsRequest(
            Conditions: null,
            Effects:
            [
                new EffectSpec
                {
                    Id = "start",
                    RuntimeEffectType = RuntimeEffects.ChangeValues,
                    EffectType = EffectKind.Activated,
                    Timing = EffectTiming.ActivateMain,
                    DurationMode = EffectDurationMode.Instant,
                    TargetRange = EffectTargetRange.Self,
                    OnFailureEffectId = "missing",
                    ContextRules = [],
                    TargetRules = new EffectTargetRuleSet
                    {
                        Rules = []
                    }
                }
            ],
            Description: null,
            SupportEffect: null,
            CannotBeNormalSummoned: null);

        var result = validator.Validate(request);

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(result.Errors.Any(error => error.ErrorMessage.Contains("OnSuccessEffectId and OnFailureEffectId must reference existing effect ids", StringComparison.Ordinal)));
    }

    [TestMethod]
    public void Validate_ReturnsError_WhenBranchGraphContainsCycle()
    {
        var validator = new UpdateCardEffectsRequestValidator();
        var request = new UpdateCardEffectsRequest(
            Conditions: null,
            Effects:
            [
                new EffectSpec
                {
                    Id = "a",
                    RuntimeEffectType = RuntimeEffects.ChangeValues,
                    EffectType = EffectKind.Activated,
                    Timing = EffectTiming.ActivateMain,
                    DurationMode = EffectDurationMode.Instant,
                    TargetRange = EffectTargetRange.Self,
                    OnSuccessEffectId = "b",
                    ContextRules = [],
                    TargetRules = new EffectTargetRuleSet
                    {
                        Rules = []
                    }
                },
                new EffectSpec
                {
                    Id = "b",
                    RuntimeEffectType = RuntimeEffects.DestroyCard,
                    EffectType = EffectKind.Activated,
                    Timing = EffectTiming.ActivateMain,
                    DurationMode = EffectDurationMode.Instant,
                    TargetRange = EffectTargetRange.Self,
                    OnFailureEffectId = "a",
                    ContextRules = [],
                    TargetRules = new EffectTargetRuleSet
                    {
                        Rules = []
                    }
                }
            ],
            Description: null,
            SupportEffect: null,
            CannotBeNormalSummoned: null);

        var result = validator.Validate(request);

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(result.Errors.Any(error => error.ErrorMessage.Contains("Effect branch graph cannot contain cycles.", StringComparison.Ordinal)));
    }
}
