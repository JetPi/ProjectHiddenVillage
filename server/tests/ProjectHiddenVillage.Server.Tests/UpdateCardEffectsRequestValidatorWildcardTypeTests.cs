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
    public void Validate_ReturnsError_WhenPredicateUsesCannotBeNormalSummonedProperty()
    {
        var validator = new UpdateCardEffectsRequestValidator();
        var request = new UpdateCardEffectsRequest(
            Conditions: null,
            Effects:
            [
                new EffectSpec
                {
                    Id = "effect-unsupported-predicate-property",
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
                                            Property = ZoneCardProperty.CannotBeNormalSummoned,
                                            Operator = ZoneCardPredicateOperator.Equals,
                                            Value = "True"
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

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(result.Errors.Any(error => error.ErrorMessage.Contains("Predicates can only use", StringComparison.Ordinal)));
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
                            DestinationZone = PlayerZone.Leader,
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
        Assert.IsTrue(result.Errors.Any(error => error.ErrorMessage.Contains("MoveCard move actions support only Hand, Deck, Trash, ExileZone, SupportZone, and CharacterField zones.", StringComparison.Ordinal)));
    }

    [TestMethod]
    public void Validate_AllowsMoveCardRule_WhenDestinationZoneIsCharacterField()
    {
        var validator = new UpdateCardEffectsRequestValidator();
        var request = new UpdateCardEffectsRequest(
            Conditions: null,
            Effects:
            [
                new EffectSpec
                {
                    Id = "effect-move-card-character-field-valid",
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
                            MoveCount = 1,
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
    public void Validate_AllowsMoveCardRule_WhenDestinationZoneIsSupportZone()
    {
        var validator = new UpdateCardEffectsRequestValidator();
        var request = new UpdateCardEffectsRequest(
            Conditions: null,
            Effects:
            [
                new EffectSpec
                {
                    Id = "effect-move-card-support-zone-valid",
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
                            DestinationZone = PlayerZone.SupportZone,
                            MoveCount = 1,
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
    public void Validate_ReturnsError_WhenNonRevealRuntimeEffectSetsRevealTimingModeToRevealFirst()
    {
        var validator = new UpdateCardEffectsRequestValidator();
        var request = new UpdateCardEffectsRequest(
            Conditions: null,
            Effects:
            [
                new EffectSpec
                {
                    Id = "effect-invalid-reveal-timing-mode",
                    RuntimeEffectType = RuntimeEffects.ChangeValues,
                    RevealTimingMode = RevealTimingMode.RevealFirst,
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

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(result.Errors.Any(error => error.ErrorMessage.Contains("Reveal timing mode can be changed only for Reveal Card runtime effects.", StringComparison.Ordinal)));
    }

    [TestMethod]
    public void Validate_AllowsRevealTimingModeForRevealRuntimeEffect()
    {
        var validator = new UpdateCardEffectsRequestValidator();
        var request = new UpdateCardEffectsRequest(
            Conditions: null,
            Effects:
            [
                new EffectSpec
                {
                    Id = "effect-valid-reveal-timing-mode",
                    RuntimeEffectType = RuntimeEffects.RevealCard,
                    RevealTimingMode = RevealTimingMode.RevealFirst,
                    EffectType = EffectKind.Support,
                    Timing = EffectTiming.Quick,
                    DurationMode = EffectDurationMode.Instant,
                    TargetRange = EffectTargetRange.Any,
                    ContextRules = [],
                    TargetRules = new EffectTargetRuleSet
                    {
                        Rules =
                        [
                            new EffectTargetRule
                            {
                                Scope = EffectTargetRange.Any,
                                InZone = PlayerZone.Hand,
                                Restriction = new ZoneCardRestriction
                                {
                                    Predicates = []
                                }
                            }
                        ]
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
    public void Validate_ReturnsError_WhenNonRevealRuntimeEffectSetsRevealPostConditionRestriction()
    {
        var validator = new UpdateCardEffectsRequestValidator();
        var request = new UpdateCardEffectsRequest(
            Conditions: null,
            Effects:
            [
                new EffectSpec
                {
                    Id = "effect-invalid-reveal-restriction-runtime",
                    RuntimeEffectType = RuntimeEffects.ChangeValues,
                    RevealPostConditionRestriction = new ZoneCardRestriction
                    {
                        MatchMode = ZoneRestrictionMatchMode.All,
                        Predicates =
                        [
                            new ZoneCardPropertyPredicate
                            {
                                Property = ZoneCardProperty.Name,
                                Operator = ZoneCardPredicateOperator.Contains,
                                Value = "Sasuke",
                                IgnoreCase = true,
                            },
                        ],
                    },
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

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(result.Errors.Any(error => error.ErrorMessage.Contains("Reveal post-condition predicate/restriction/rule-set can only be set for Reveal Card runtime effects.", StringComparison.Ordinal)));
    }

    [TestMethod]
    public void Validate_ReturnsError_WhenRevealPostConditionRestrictionIsSetWithoutRevealFirstTiming()
    {
        var validator = new UpdateCardEffectsRequestValidator();
        var request = new UpdateCardEffectsRequest(
            Conditions: null,
            Effects:
            [
                new EffectSpec
                {
                    Id = "effect-invalid-reveal-restriction-timing",
                    RuntimeEffectType = RuntimeEffects.RevealCard,
                    RevealTimingMode = RevealTimingMode.RevealLast,
                    RevealPostConditionRestriction = new ZoneCardRestriction
                    {
                        MatchMode = ZoneRestrictionMatchMode.All,
                        Predicates =
                        [
                            new ZoneCardPropertyPredicate
                            {
                                Property = ZoneCardProperty.Name,
                                Operator = ZoneCardPredicateOperator.Contains,
                                Value = "Sasuke",
                                IgnoreCase = true,
                            },
                        ],
                    },
                    EffectType = EffectKind.Support,
                    Timing = EffectTiming.Quick,
                    DurationMode = EffectDurationMode.Instant,
                    TargetRange = EffectTargetRange.Any,
                    ContextRules = [],
                    TargetRules = new EffectTargetRuleSet
                    {
                        Rules =
                        [
                            new EffectTargetRule
                            {
                                Scope = EffectTargetRange.Any,
                                InZone = PlayerZone.Hand,
                                Restriction = new ZoneCardRestriction
                                {
                                    Predicates = []
                                }
                            }
                        ]
                    }
                }
            ],
            Description: null,
            SupportEffect: null,
            CannotBeNormalSummoned: null);

        var result = validator.Validate(request);

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(result.Errors.Any(error => error.ErrorMessage.Contains("Reveal post-condition predicate/restriction/rule-set requires Reveal Timing Mode to be Reveal First.", StringComparison.Ordinal)));

    }

    [TestMethod]
    public void Validate_AllowsRevealPostConditionRuleSetForRevealRuntimeEffect()
    {
        var validator = new UpdateCardEffectsRequestValidator();
        var request = new UpdateCardEffectsRequest(
            Conditions: null,
            Effects:
            [
                new EffectSpec
                {
                    Id = "effect-valid-reveal-rule-set",
                    RuntimeEffectType = RuntimeEffects.RevealCard,
                    RevealTimingMode = RevealTimingMode.RevealFirst,
                    RevealPostConditionRuleSet = new ZoneCardRestrictionRuleSet
                    {
                        Operator = RequirementGroupOperator.Any,
                        Restrictions =
                        [
                            new ZoneCardRestriction
                            {
                                MatchMode = ZoneRestrictionMatchMode.All,
                                Predicates =
                                [
                                    new ZoneCardPropertyPredicate
                                    {
                                        Property = ZoneCardProperty.Name,
                                        Operator = ZoneCardPredicateOperator.Contains,
                                        Value = "Sasuke",
                                        IgnoreCase = true,
                                    },
                                    new ZoneCardPropertyPredicate
                                    {
                                        Property = ZoneCardProperty.Type,
                                        Operator = ZoneCardPredicateOperator.NotEquals,
                                        Value = "EX Character",
                                        IgnoreCase = true,
                                    },
                                ],
                            },
                            new ZoneCardRestriction
                            {
                                MatchMode = ZoneRestrictionMatchMode.All,
                                Predicates =
                                [
                                    new ZoneCardPropertyPredicate
                                    {
                                        Property = ZoneCardProperty.Trait,
                                        Operator = ZoneCardPredicateOperator.Equals,
                                        Value = "The Taka",
                                        IgnoreCase = true,
                                    },
                                    new ZoneCardPropertyPredicate
                                    {
                                        Property = ZoneCardProperty.Type,
                                        Operator = ZoneCardPredicateOperator.NotEquals,
                                        Value = "EX Character",
                                        IgnoreCase = true,
                                    },
                                ],
                            },
                        ],
                    },
                    EffectType = EffectKind.Support,
                    Timing = EffectTiming.Quick,
                    DurationMode = EffectDurationMode.Instant,
                    TargetRange = EffectTargetRange.Any,
                    ContextRules = [],
                    TargetRules = new EffectTargetRuleSet
                    {
                        Rules =
                        [
                            new EffectTargetRule
                            {
                                Scope = EffectTargetRange.Any,
                                InZone = PlayerZone.Hand,
                                Restriction = new ZoneCardRestriction
                                {
                                    Predicates = []
                                }
                            }
                        ]
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
    public void Validate_ReturnsError_WhenRevealPostConditionRuleSetHasNoGroups()
    {
        var validator = new UpdateCardEffectsRequestValidator();
        var request = new UpdateCardEffectsRequest(
            Conditions: null,
            Effects:
            [
                new EffectSpec
                {
                    Id = "effect-invalid-reveal-rule-set-empty",
                    RuntimeEffectType = RuntimeEffects.RevealCard,
                    RevealTimingMode = RevealTimingMode.RevealFirst,
                    RevealPostConditionRuleSet = new ZoneCardRestrictionRuleSet
                    {
                        Operator = RequirementGroupOperator.Any,
                        Restrictions = [],
                    },
                    EffectType = EffectKind.Support,
                    Timing = EffectTiming.Quick,
                    DurationMode = EffectDurationMode.Instant,
                    TargetRange = EffectTargetRange.Any,
                    ContextRules = [],
                    TargetRules = new EffectTargetRuleSet
                    {
                        Rules =
                        [
                            new EffectTargetRule
                            {
                                Scope = EffectTargetRange.Any,
                                InZone = PlayerZone.Hand,
                                Restriction = new ZoneCardRestriction
                                {
                                    Predicates = []
                                }
                            }
                        ]
                    }
                }
            ],
            Description: null,
            SupportEffect: null,
            CannotBeNormalSummoned: null);

        var result = validator.Validate(request);

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(result.Errors.Any(error => error.ErrorMessage.Contains("Reveal post-condition rule set must include at least one restriction group.", StringComparison.Ordinal)));
    }

    [TestMethod]
    public void Validate_AllowsNonInstantDuration_ForFreezeCardRuntimeEffect()
    {
        var validator = new UpdateCardEffectsRequestValidator();
        var request = new UpdateCardEffectsRequest(
            Conditions: null,
            Effects:
            [
                new EffectSpec
                {
                    Id = "effect-freeze-during-opponent-next-turn",
                    RuntimeEffectType = RuntimeEffects.FreezeCard,
                    EffectType = EffectKind.Activated,
                    Timing = EffectTiming.OnSummon,
                    DurationMode = EffectDurationMode.DuringOpponentNextTurn,
                    TargetRange = EffectTargetRange.Any,
                    ContextRules = [],
                    TargetRules = new EffectTargetRuleSet
                    {
                        Rules =
                        [
                            new EffectTargetRule
                            {
                                Scope = EffectTargetRange.Any,
                                InZone = PlayerZone.CharacterField,
                                Restriction = new ZoneCardRestriction
                                {
                                    Predicates = []
                                }
                            }
                        ]
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
    public void Validate_AllowsFaceStateLocks_ForAlterResourcesWithNonInstantDuration()
    {
        var validator = new UpdateCardEffectsRequestValidator();
        var request = new UpdateCardEffectsRequest(
            Conditions: null,
            Effects:
            [
                new EffectSpec
                {
                    Id = "effect-face-lock-valid",
                    RuntimeEffectType = RuntimeEffects.AlterResources,
                    EffectType = EffectKind.Support,
                    Timing = EffectTiming.Quick,
                    DurationMode = EffectDurationMode.DuringOpponentNextTurn,
                    TargetRange = EffectTargetRange.Self,
                    FaceStateLocks =
                    [
                        new FaceStateLockSpec
                        {
                            TargetCategory = FaceStateTargetCategory.ChakraCard,
                            Operation = FaceStateLockOperation.CannotTurnFaceUp,
                            TargetRange = EffectTargetRange.Self,
                        }
                    ],
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
    public void Validate_ReturnsError_WhenFaceStateLocksUseInstantDuration()
    {
        var validator = new UpdateCardEffectsRequestValidator();
        var request = new UpdateCardEffectsRequest(
            Conditions: null,
            Effects:
            [
                new EffectSpec
                {
                    Id = "effect-face-lock-instant-invalid",
                    RuntimeEffectType = RuntimeEffects.AlterResources,
                    EffectType = EffectKind.Support,
                    Timing = EffectTiming.Quick,
                    DurationMode = EffectDurationMode.Instant,
                    TargetRange = EffectTargetRange.Self,
                    FaceStateLocks =
                    [
                        new FaceStateLockSpec
                        {
                            TargetCategory = FaceStateTargetCategory.ChakraCard,
                            Operation = FaceStateLockOperation.CannotTurnFaceUp,
                            TargetRange = EffectTargetRange.Self,
                        }
                    ],
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
        Assert.IsTrue(result.Errors.Any(error =>
            error.ErrorMessage.Contains("Face-state locks require a non-instant duration mode.", StringComparison.Ordinal)));
    }

    [TestMethod]
    public void Validate_ReturnsError_WhenDuplicateFaceStateLocksAreProvided()
    {
        var validator = new UpdateCardEffectsRequestValidator();
        var request = new UpdateCardEffectsRequest(
            Conditions: null,
            Effects:
            [
                new EffectSpec
                {
                    Id = "effect-face-lock-duplicate-invalid",
                    RuntimeEffectType = RuntimeEffects.AlterResources,
                    EffectType = EffectKind.Support,
                    Timing = EffectTiming.Quick,
                    DurationMode = EffectDurationMode.DuringThisTurn,
                    TargetRange = EffectTargetRange.Self,
                    FaceStateLocks =
                    [
                        new FaceStateLockSpec
                        {
                            TargetCategory = FaceStateTargetCategory.SupportZoneCards,
                            Operation = FaceStateLockOperation.CannotTurnFaceUp,
                            TargetRange = EffectTargetRange.Self,
                        },
                        new FaceStateLockSpec
                        {
                            TargetCategory = FaceStateTargetCategory.SupportZoneCards,
                            Operation = FaceStateLockOperation.CannotTurnFaceUp,
                            TargetRange = EffectTargetRange.Self,
                        }
                    ],
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
        Assert.IsTrue(result.Errors.Any(error =>
            error.ErrorMessage.Contains("Face-state locks cannot contain duplicate category/operation/target-range combinations.", StringComparison.Ordinal)));
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
                    IsSubordinate = true,
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

    [TestMethod]
    public void Validate_AllowsMultipleEffectsMarkedAsEntry_WhenTheyAreSubordinate()
    {
        var validator = new UpdateCardEffectsRequestValidator();
        var request = new UpdateCardEffectsRequest(
            Conditions: null,
            Effects:
            [
                new EffectSpec
                {
                    Id = "entry-a",
                    IsSubordinate = true,
                    RuntimeEffectType = RuntimeEffects.ChangeValues,
                    EffectType = EffectKind.Activated,
                    Timing = EffectTiming.ActivateMain,
                    DurationMode = EffectDurationMode.Instant,
                    TargetRange = EffectTargetRange.Self,
                    ContextRules = [],
                    TargetRules = new EffectTargetRuleSet { Rules = [] }
                },
                new EffectSpec
                {
                    Id = "entry-b",
                    IsSubordinate = true,
                    RuntimeEffectType = RuntimeEffects.DestroyCard,
                    EffectType = EffectKind.Activated,
                    Timing = EffectTiming.ActivateMain,
                    DurationMode = EffectDurationMode.Instant,
                    TargetRange = EffectTargetRange.Self,
                    ContextRules = [],
                    TargetRules = new EffectTargetRuleSet { Rules = [] }
                }
            ],
            Description: null,
            SupportEffect: null,
            CannotBeNormalSummoned: null);

        var result = validator.Validate(request);

        Assert.IsTrue(result.IsValid);
    }

    [TestMethod]
    public void Validate_ReturnsError_WhenBranchTargetsReferenceNonEntryEffect()
    {
        var validator = new UpdateCardEffectsRequestValidator();
        var request = new UpdateCardEffectsRequest(
            Conditions: null,
            Effects:
            [
                new EffectSpec
                {
                    Id = "non-entry-target",
                    IsSubordinate = false,
                    RuntimeEffectType = RuntimeEffects.ChangeValues,
                    EffectType = EffectKind.Activated,
                    Timing = EffectTiming.ActivateMain,
                    DurationMode = EffectDurationMode.Instant,
                    TargetRange = EffectTargetRange.Self,
                    ContextRules = [],
                    TargetRules = new EffectTargetRuleSet { Rules = [] }
                },
                new EffectSpec
                {
                    Id = "other",
                    RuntimeEffectType = RuntimeEffects.DestroyCard,
                    EffectType = EffectKind.Activated,
                    Timing = EffectTiming.ActivateMain,
                    DurationMode = EffectDurationMode.Instant,
                    TargetRange = EffectTargetRange.Self,
                    OnSuccessEffectId = "non-entry-target",
                    ContextRules = [],
                    TargetRules = new EffectTargetRuleSet { Rules = [] }
                }
            ],
            Description: null,
            SupportEffect: null,
            CannotBeNormalSummoned: null);

        var result = validator.Validate(request);

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(result.Errors.Any(error => error.ErrorMessage.Contains("Effects referenced by OnSuccessEffectId or OnFailureEffectId must be marked as subordinate.", StringComparison.Ordinal)));
    }

    [TestMethod]
    public void Validate_AllowsBranchTargets_WhenReferencedEffectsAreMarkedAsEntry()
    {
        var validator = new UpdateCardEffectsRequestValidator();
        var request = new UpdateCardEffectsRequest(
            Conditions: null,
            Effects:
            [
                new EffectSpec
                {
                    Id = "subordinate",
                    IsSubordinate = true,
                    RuntimeEffectType = RuntimeEffects.ChangeValues,
                    EffectType = EffectKind.Activated,
                    Timing = EffectTiming.ActivateMain,
                    DurationMode = EffectDurationMode.Instant,
                    TargetRange = EffectTargetRange.Self,
                    ContextRules = [],
                    TargetRules = new EffectTargetRuleSet { Rules = [] }
                },
                new EffectSpec
                {
                    Id = "root",
                    RuntimeEffectType = RuntimeEffects.DestroyCard,
                    EffectType = EffectKind.Activated,
                    Timing = EffectTiming.ActivateMain,
                    DurationMode = EffectDurationMode.Instant,
                    TargetRange = EffectTargetRange.Self,
                    OnSuccessEffectId = "subordinate",
                    ContextRules = [],
                    TargetRules = new EffectTargetRuleSet { Rules = [] }
                }
            ],
            Description: null,
            SupportEffect: null,
            CannotBeNormalSummoned: null);

        var result = validator.Validate(request);

        Assert.IsTrue(result.IsValid);
    }

    [TestMethod]
    public void Validate_AllowsKeywordModification_WhenKeywordIsCanonical()
    {
        var validator = new UpdateCardEffectsRequestValidator();
        var request = new UpdateCardEffectsRequest(
            Conditions: null,
            Effects:
            [
                new EffectSpec
                {
                    Id = "effect-keyword-valid",
                    RuntimeEffectType = RuntimeEffects.GainEffect,
                    EffectType = EffectKind.Activated,
                    Timing = EffectTiming.Quick,
                    DurationMode = EffectDurationMode.DuringThisTurn,
                    TargetRange = EffectTargetRange.Self,
                    KeywordModifications =
                    [
                        new KeywordModificationSpec
                        {
                            TargetType = KeywordModificationTargetType.SelectedTargets,
                            Operation = KeywordModificationOperation.Add,
                            Keyword = EffectConditionKeywords.NotAffectedByOpponentSupportEffects,
                        }
                    ],
                    ContextRules = [],
                    TargetRules = new EffectTargetRuleSet
                    {
                        Rules =
                        [
                            new EffectTargetRule
                            {
                                Scope = EffectTargetRange.Self,
                                InZone = PlayerZone.CharacterField,
                                Restriction = new ZoneCardRestriction
                                {
                                    Predicates = []
                                }
                            }
                        ]
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
    public void Validate_ReturnsError_WhenKeywordModificationUsesUnknownKeyword()
    {
        var validator = new UpdateCardEffectsRequestValidator();
        var request = new UpdateCardEffectsRequest(
            Conditions: null,
            Effects:
            [
                new EffectSpec
                {
                    Id = "effect-keyword-invalid",
                    RuntimeEffectType = RuntimeEffects.GainEffect,
                    EffectType = EffectKind.Activated,
                    Timing = EffectTiming.Quick,
                    DurationMode = EffectDurationMode.DuringThisTurn,
                    TargetRange = EffectTargetRange.Self,
                    KeywordModifications =
                    [
                        new KeywordModificationSpec
                        {
                            TargetType = KeywordModificationTargetType.SourceCard,
                            Operation = KeywordModificationOperation.Add,
                            Keyword = "Totally Unknown Keyword",
                        }
                    ],
                    ContextRules = [],
                    TargetRules = new EffectTargetRuleSet
                    {
                        Rules =
                        [
                            new EffectTargetRule
                            {
                                Scope = EffectTargetRange.Self,
                                InZone = PlayerZone.CharacterField,
                                Restriction = new ZoneCardRestriction
                                {
                                    Predicates = []
                                }
                            }
                        ]
                    }
                }
            ],
            Description: null,
            SupportEffect: null,
            CannotBeNormalSummoned: null);

        var result = validator.Validate(request);

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(result.Errors.Any(error =>
            error.ErrorMessage.Contains("Keyword modifications must use a supported effect condition keyword.", StringComparison.Ordinal)));
    }
}
