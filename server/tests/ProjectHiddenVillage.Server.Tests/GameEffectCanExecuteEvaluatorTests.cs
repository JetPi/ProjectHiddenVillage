using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class GameEffectCanExecuteEvaluatorTests
{
    [TestMethod]
    public void Evaluate_ReturnsCannotExecute_WhenSelectedTargetCountIsBelowMinimum()
    {
        var evaluator = CreateEvaluator();
        var effectSpec = new EffectSpec
        {
            RuntimeEffectType = RuntimeEffects.DestroyCard,
            ContextRules = [],
            TargetRules = new EffectTargetRuleSet
            {
                MinimumTargetCount = 2,
            }
        };

        var context = CreateContext(
            playerOneResource: 0,
            selectedTargets:
            [
                new GameEffectTargetReference("p2", PlayerZone.CharacterField, "target-1")
            ],
            arguments: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                [ReactiveEffectExecutionConstants.EnforceTargetCountArgument] = bool.TrueString,
            });

        var result = evaluator.Evaluate(context, effectSpec, includeValidTargets: false);

        Assert.IsFalse(result.CanExecute);
        Assert.IsTrue(result.FailedConditions.Any(message =>
            message.Contains("at least 2", StringComparison.OrdinalIgnoreCase)));
    }

    [TestMethod]
    public void Evaluate_ReturnsCannotExecute_WhenSelectedTargetCountIsAboveMaximum()
    {
        var evaluator = CreateEvaluator();
        var effectSpec = new EffectSpec
        {
            RuntimeEffectType = RuntimeEffects.DestroyCard,
            ContextRules = [],
            TargetRules = new EffectTargetRuleSet
            {
                MaximumTargetCount = 1,
            }
        };

        var context = CreateContext(
            playerOneResource: 0,
            selectedTargets:
            [
                new GameEffectTargetReference("p2", PlayerZone.CharacterField, "target-1"),
                new GameEffectTargetReference("p2", PlayerZone.CharacterField, "target-2"),
            ],
            arguments: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                [ReactiveEffectExecutionConstants.EnforceTargetCountArgument] = bool.TrueString,
            });

        var result = evaluator.Evaluate(context, effectSpec, includeValidTargets: false);

        Assert.IsFalse(result.CanExecute);
        Assert.IsTrue(result.FailedConditions.Any(message =>
            message.Contains("no more than 1", StringComparison.OrdinalIgnoreCase)));
    }

    [TestMethod]
    public void Evaluate_ReturnsCannotExecute_WhenValidTargetPoolIsBelowMinimum()
    {
        var evaluator = CreateEvaluator(
            resolvedTargets:
            [
                new GameEffectTargetReference("p2", PlayerZone.CharacterField, "target-1"),
            ]);

        var effectSpec = new EffectSpec
        {
            RuntimeEffectType = RuntimeEffects.DestroyCard,
            ContextRules = [],
            TargetRules = new EffectTargetRuleSet
            {
                MinimumTargetCount = 2,
            }
        };

        var context = CreateContext(
            playerOneResource: 0,
            arguments: new Dictionary<string, string>(StringComparer.Ordinal));

        var result = evaluator.Evaluate(context, effectSpec, includeValidTargets: true);

        Assert.IsFalse(result.CanExecute);
        Assert.IsTrue(result.FailedConditions.Any(message =>
            message.Contains("Not enough valid targets", StringComparison.OrdinalIgnoreCase)));
    }

    [TestMethod]
    public void Evaluate_ReturnsCannotExecute_WhenExactCountIsCombinedWithMinimumOrMaximum()
    {
        var evaluator = CreateEvaluator();
        var effectSpec = new EffectSpec
        {
            RuntimeEffectType = RuntimeEffects.DestroyCard,
            ContextRules = [],
            TargetRules = new EffectTargetRuleSet
            {
                ExactTargetCount = 1,
                MinimumTargetCount = 1,
            }
        };

        var context = CreateContext(
            playerOneResource: 0,
            arguments: new Dictionary<string, string>(StringComparer.Ordinal));

        var result = evaluator.Evaluate(context, effectSpec, includeValidTargets: false);

        Assert.IsFalse(result.CanExecute);
        Assert.IsTrue(result.FailedConditions.Any(message =>
            message.Contains("cannot be combined", StringComparison.OrdinalIgnoreCase)));
    }

    [TestMethod]
    public void Evaluate_ReturnsCannotExecute_WhenSupportActivationCostExceedsResourcePool()
    {
        var evaluator = CreateEvaluator();
        var effectSpec = new EffectSpec
        {
            RuntimeEffectType = RuntimeEffects.SummonCard,
            ContextRules = []
        };

        var context = CreateContext(
            playerOneResource: 1,
            arguments: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                [ReactiveEffectExecutionConstants.SupportActivationChakraCostArgument] = "2"
            });

        var result = evaluator.Evaluate(context, effectSpec, includeValidTargets: false);

        Assert.IsFalse(result.CanExecute);
        Assert.IsTrue(result.FailedConditions.Any(message =>
            message.Contains("does not have enough chakra", StringComparison.OrdinalIgnoreCase)));
    }

    [TestMethod]
    public void Evaluate_ReturnsCanExecute_WhenSupportActivationCostIsAffordable()
    {
        var evaluator = CreateEvaluator();
        var effectSpec = new EffectSpec
        {
            RuntimeEffectType = RuntimeEffects.SummonCard,
            ContextRules = []
        };

        var context = CreateContext(
            playerOneResource: 2,
            arguments: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                [ReactiveEffectExecutionConstants.SupportActivationChakraCostArgument] = "2"
            });

        var result = evaluator.Evaluate(context, effectSpec, includeValidTargets: false);

        Assert.IsTrue(result.CanExecute);
        Assert.AreEqual(0, result.FailedConditions.Count);
    }

    [TestMethod]
    public void Evaluate_IgnoresMissingOrInvalidSupportActivationCostArgument()
    {
        var evaluator = CreateEvaluator();
        var effectSpec = new EffectSpec
        {
            RuntimeEffectType = RuntimeEffects.SummonCard,
            ContextRules = []
        };

        var context = CreateContext(
            playerOneResource: 0,
            arguments: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                [ReactiveEffectExecutionConstants.SupportActivationChakraCostArgument] = "not-a-number"
            });

        var result = evaluator.Evaluate(context, effectSpec, includeValidTargets: false);

        Assert.IsTrue(result.CanExecute);
        Assert.AreEqual(0, result.FailedConditions.Count);
    }

    [TestMethod]
    public void Evaluate_ReturnsCannotExecute_WhenTributeCompositionRequiresDistinctTargets()
    {
        var evaluator = CreateEvaluator();
        var effectSpec = new EffectSpec
        {
            RuntimeEffectType = RuntimeEffects.Tribute,
            ContextRules = [],
            TargetRules = new EffectTargetRuleSet
            {
                Rules =
                [
                    new EffectTargetRule
                    {
                        Scope = EffectTargetRange.Self,
                        InZone = PlayerZone.CharacterField,
                        TributeRole = TributeTargetRole.SummonCandidate,
                        Restriction = new ZoneCardRestriction
                        {
                            Predicates =
                            [
                                new ZoneCardPropertyPredicate
                                {
                                    Property = "name",
                                    Operator = ZoneCardPredicateOperator.In,
                                    Values = ["Ninja A"]
                                }
                            ]
                        }
                    },
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
                                    Property = "name",
                                    Operator = ZoneCardPredicateOperator.In,
                                    Values = ["Ninja A", "Ninja B"]
                                }
                            ]
                        }
                    }
                ],
                TributeComposition = new TributeTargetComposition
                {
                    ExactTributeCount = 1,
                    RequireSingleSummonTarget = true,
                    RequireDistinctSummonAndTributes = true,
                }
            }
        };

        var selectedTargets =
            new List<GameEffectTargetReference>
            {
                new("p1", PlayerZone.CharacterField, "ninja-a-inst")
            };

        var context = CreateContext(
            playerOneResource: 0,
            selectedTargets: selectedTargets,
            arguments: new Dictionary<string, string>(StringComparer.Ordinal),
            playerOneFieldCards:
            [
                CreateCardOnField("ninja-a", "ninja-a-inst", "p1", "Ninja A"),
                CreateCardOnField("ninja-b", "ninja-b-inst", "p1", "Ninja B"),
            ]);

        var result = evaluator.Evaluate(context, effectSpec, includeValidTargets: false);

        Assert.IsFalse(result.CanExecute);
        Assert.IsTrue(result.FailedConditions.Any(message =>
            message.Contains("distinct", StringComparison.OrdinalIgnoreCase)
            || message.Contains("exactly 1 tribute", StringComparison.OrdinalIgnoreCase)));
    }

    [TestMethod]
    public void Evaluate_ReturnsCanExecute_WhenTributeCompositionIsSatisfied()
    {
        var evaluator = CreateEvaluator();
        var effectSpec = new EffectSpec
        {
            RuntimeEffectType = RuntimeEffects.Tribute,
            ContextRules = [],
            TargetRules = new EffectTargetRuleSet
            {
                Rules =
                [
                    new EffectTargetRule
                    {
                        Scope = EffectTargetRange.Self,
                        InZone = PlayerZone.CharacterField,
                        TributeRole = TributeTargetRole.SummonCandidate,
                        Restriction = new ZoneCardRestriction
                        {
                            Predicates =
                            [
                                new ZoneCardPropertyPredicate
                                {
                                    Property = "name",
                                    Operator = ZoneCardPredicateOperator.In,
                                    Values = ["Ninja A"]
                                }
                            ]
                        }
                    },
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
                                    Property = "name",
                                    Operator = ZoneCardPredicateOperator.In,
                                    Values = ["Ninja B"]
                                }
                            ]
                        }
                    }
                ],
                TributeComposition = new TributeTargetComposition
                {
                    ExactTributeCount = 1,
                    RequireSingleSummonTarget = true,
                    RequireDistinctSummonAndTributes = true,
                }
            }
        };

        var context = CreateContext(
            playerOneResource: 0,
            selectedTargets:
            [
                new("p1", PlayerZone.CharacterField, "ninja-a-inst"),
                new("p1", PlayerZone.CharacterField, "ninja-b-inst"),
            ],
            arguments: new Dictionary<string, string>(StringComparer.Ordinal),
            playerOneFieldCards:
            [
                CreateCardOnField("ninja-a", "ninja-a-inst", "p1", "Ninja A"),
                CreateCardOnField("ninja-b", "ninja-b-inst", "p1", "Ninja B"),
            ]);

        var result = evaluator.Evaluate(context, effectSpec, includeValidTargets: false);

        Assert.IsTrue(result.CanExecute);
        Assert.AreEqual(0, result.FailedConditions.Count);
    }

    [TestMethod]
    public void Evaluate_ReturnsCannotExecute_WhenPerRuleSelectedCountRequirementFails()
    {
        var evaluator = CreateEvaluator();
        var effectSpec = new EffectSpec
        {
            RuntimeEffectType = RuntimeEffects.Tribute,
            ContextRules = [],
            TargetRules = new EffectTargetRuleSet
            {
                Rules =
                [
                    new EffectTargetRule
                    {
                        Scope = EffectTargetRange.Self,
                        InZone = PlayerZone.CharacterField,
                        TributeRole = TributeTargetRole.SummonCandidate,
                        Restriction = new ZoneCardRestriction
                        {
                            Predicates =
                            [
                                new ZoneCardPropertyPredicate
                                {
                                    Property = "name",
                                    Operator = ZoneCardPredicateOperator.In,
                                    Values = ["Summon Target"]
                                }
                            ]
                        }
                    },
                    new EffectTargetRule
                    {
                        Scope = EffectTargetRange.Self,
                        InZone = PlayerZone.CharacterField,
                        TributeRole = TributeTargetRole.TributeMaterial,
                        MinimumSelectedTargetCount = 1,
                        Restriction = new ZoneCardRestriction
                        {
                            Predicates =
                            [
                                new ZoneCardPropertyPredicate
                                {
                                    Property = "type",
                                    Operator = ZoneCardPredicateOperator.In,
                                    Values = ["Character"]
                                },
                                new ZoneCardPropertyPredicate
                                {
                                    Property = "name",
                                    Operator = ZoneCardPredicateOperator.NotEquals,
                                    Value = "Summon Target"
                                }
                            ]
                        }
                    },
                    new EffectTargetRule
                    {
                        Scope = EffectTargetRange.Self,
                        InZone = PlayerZone.CharacterField,
                        TributeRole = TributeTargetRole.TributeMaterial,
                        MinimumSelectedTargetCount = 1,
                        Restriction = new ZoneCardRestriction
                        {
                            Predicates =
                            [
                                new ZoneCardPropertyPredicate
                                {
                                    Property = "power",
                                    Operator = ZoneCardPredicateOperator.GreaterThanOrEqual,
                                    Value = "10"
                                }
                            ]
                        }
                    }
                ],
                TributeComposition = new TributeTargetComposition
                {
                    ExactTributeCount = 2,
                    RequireSingleSummonTarget = true,
                    RequireDistinctSummonAndTributes = true,
                }
            }
        };

        var context = CreateContext(
            playerOneResource: 0,
            selectedTargets:
            [
                new("p1", PlayerZone.CharacterField, "summon-inst"),
                new("p1", PlayerZone.CharacterField, "tribute-low-a-inst"),
                new("p1", PlayerZone.CharacterField, "tribute-low-b-inst"),
            ],
            arguments: new Dictionary<string, string>(StringComparer.Ordinal),
            playerOneFieldCards:
            [
                CreateCardOnField("summon", "summon-inst", "p1", "Summon Target", power: 5),
                CreateCardOnField("tribute-low-a", "tribute-low-a-inst", "p1", "Low A", power: 4),
                CreateCardOnField("tribute-low-b", "tribute-low-b-inst", "p1", "Low B", power: 3),
            ]);

        var result = evaluator.Evaluate(context, effectSpec, includeValidTargets: false);

        Assert.IsFalse(result.CanExecute);
        Assert.IsTrue(result.FailedConditions.Any(message =>
            message.Contains("Target rule", StringComparison.OrdinalIgnoreCase)
            && message.Contains("at least 1", StringComparison.OrdinalIgnoreCase)));
    }

    [TestMethod]
    public void Evaluate_ReturnsCanExecute_WhenPerRuleSelectedCountRequirementIsSatisfied()
    {
        var evaluator = CreateEvaluator();
        var effectSpec = new EffectSpec
        {
            RuntimeEffectType = RuntimeEffects.Tribute,
            ContextRules = [],
            TargetRules = new EffectTargetRuleSet
            {
                Rules =
                [
                    new EffectTargetRule
                    {
                        Scope = EffectTargetRange.Self,
                        InZone = PlayerZone.CharacterField,
                        TributeRole = TributeTargetRole.SummonCandidate,
                        Restriction = new ZoneCardRestriction
                        {
                            Predicates =
                            [
                                new ZoneCardPropertyPredicate
                                {
                                    Property = "name",
                                    Operator = ZoneCardPredicateOperator.In,
                                    Values = ["Summon Target"]
                                }
                            ]
                        }
                    },
                    new EffectTargetRule
                    {
                        Scope = EffectTargetRange.Self,
                        InZone = PlayerZone.CharacterField,
                        TributeRole = TributeTargetRole.TributeMaterial,
                        MinimumSelectedTargetCount = 1,
                        Restriction = new ZoneCardRestriction
                        {
                            Predicates =
                            [
                                new ZoneCardPropertyPredicate
                                {
                                    Property = "type",
                                    Operator = ZoneCardPredicateOperator.In,
                                    Values = ["Character"]
                                },
                                new ZoneCardPropertyPredicate
                                {
                                    Property = "name",
                                    Operator = ZoneCardPredicateOperator.NotEquals,
                                    Value = "Summon Target"
                                }
                            ]
                        }
                    },
                    new EffectTargetRule
                    {
                        Scope = EffectTargetRange.Self,
                        InZone = PlayerZone.CharacterField,
                        TributeRole = TributeTargetRole.TributeMaterial,
                        MinimumSelectedTargetCount = 1,
                        Restriction = new ZoneCardRestriction
                        {
                            Predicates =
                            [
                                new ZoneCardPropertyPredicate
                                {
                                    Property = "power",
                                    Operator = ZoneCardPredicateOperator.GreaterThanOrEqual,
                                    Value = "10"
                                }
                            ]
                        }
                    }
                ],
                TributeComposition = new TributeTargetComposition
                {
                    ExactTributeCount = 2,
                    RequireSingleSummonTarget = true,
                    RequireDistinctSummonAndTributes = true,
                }
            }
        };

        var context = CreateContext(
            playerOneResource: 0,
            selectedTargets:
            [
                new("p1", PlayerZone.CharacterField, "summon-inst"),
                new("p1", PlayerZone.CharacterField, "tribute-high-inst"),
                new("p1", PlayerZone.CharacterField, "tribute-low-inst"),
            ],
            arguments: new Dictionary<string, string>(StringComparer.Ordinal),
            playerOneFieldCards:
            [
                CreateCardOnField("summon", "summon-inst", "p1", "Summon Target", power: 5),
                CreateCardOnField("tribute-high", "tribute-high-inst", "p1", "High Tribute", power: 11),
                CreateCardOnField("tribute-low", "tribute-low-inst", "p1", "Low Tribute", power: 3),
            ]);

        var result = evaluator.Evaluate(context, effectSpec, includeValidTargets: false);

        Assert.IsTrue(result.CanExecute);
        Assert.AreEqual(0, result.FailedConditions.Count);
    }

    private static GameEffectCanExecuteEvaluator CreateEvaluator(IReadOnlyList<GameEffectTargetReference>? resolvedTargets = null)
    {
        return new GameEffectCanExecuteEvaluator(
            conditionEvaluator: new StubConditionEvaluator(),
            targetResolver: new StubTargetResolver(resolvedTargets ?? []),
            validTargetResultFactory: new StubValidTargetResultFactory(),
            conditionDiagnostics: new StubConditionDiagnostics());
    }

    private static GameCardEffectContext CreateContext(
        int playerOneResource,
        IReadOnlyDictionary<string, string> arguments,
        IReadOnlyList<GameEffectTargetReference>? selectedTargets = null,
        IReadOnlyList<(Card Card, CardInstance Instance)>? playerOneFieldCards = null,
        IReadOnlyList<(Card Card, CardInstance Instance)>? playerTwoFieldCards = null)
    {
        var sourceCard = new CardInstance
        {
            InstanceId = "source-1",
            CardDefinitionId = "source-def",
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
        };

        var sourceDefinition = new CharacterCard
        {
            Id = "source-def",
            DisplayName = "Source",
            Name = ["Source"],
            Type = CardType.Character,
            Color = CardColor.Blue,
            Traits = ["Ninja"],
            Description = string.Empty,
            Damage = 0,
            Power = 1,
            Health = 2,
            Effects = []
        };

        var state = new GameState
        {
            GameId = "game-can-execute-1",
            ActivePlayerId = "p1",
            PriorityPlayerId = "p1",
            Players =
            [
                new PlayerState
                {
                    PlayerId = "p1",
                    ResourcePool = playerOneResource,
                    Battlefield = [sourceCard, ..(playerOneFieldCards?.Select(entry => entry.Instance) ?? [])],
                },
                new PlayerState
                {
                    PlayerId = "p2",
                    Battlefield = [..(playerTwoFieldCards?.Select(entry => entry.Instance) ?? [])],
                }
            ],
            CardDefinitions =
            {
                ["source-def"] = sourceDefinition,
            }
        };

        foreach (var (card, _) in playerOneFieldCards ?? [])
        {
            state.CardDefinitions[card.Id] = card;
        }

        foreach (var (card, _) in playerTwoFieldCards ?? [])
        {
            state.CardDefinitions[card.Id] = card;
        }

        return new GameCardEffectContext(
            game: new GameInstance(state),
            actingPlayer: new Player { Id = "p1" },
            sourceCardDefinition: sourceDefinition,
            sourceCardInstance: sourceCard,
            arguments: arguments,
                selectedTargets: selectedTargets ?? []);
    }

    private static (Card Card, CardInstance Instance) CreateCardOnField(
        string cardDefinitionId,
        string instanceId,
        string controllerPlayerId,
        string displayName,
        int power = 2)
    {
        var card = new CharacterCard
        {
            Id = cardDefinitionId,
            DisplayName = displayName,
            Name = [displayName],
            Type = CardType.Character,
            Color = CardColor.Green,
            Traits = ["Ninja"],
            Power = power,
            Damage = 1,
            Health = 2,
        };

        var instance = new CardInstance
        {
            InstanceId = instanceId,
            CardDefinitionId = cardDefinitionId,
            OwnerPlayerId = controllerPlayerId,
            ControllerPlayerId = controllerPlayerId,
        };

        return (card, instance);
    }

    private sealed class StubConditionEvaluator : IGameEffectContextConditionEvaluator
    {
        public bool IsConditionSatisfied(EffectContextCondition condition, PlayerState playerState, GameState gameState)
        {
            return true;
        }
    }

    private sealed class StubTargetResolver(IReadOnlyList<GameEffectTargetReference> resolvedTargets) : IGameEffectTargetResolver
    {
        private readonly IReadOnlyList<GameEffectTargetReference> resolvedTargets = resolvedTargets;

        public IReadOnlyList<GameEffectTargetReference> ResolveTargets(GameCardEffectContext context, EffectSpec effectSpec)
        {
            return resolvedTargets;
        }
    }

    private sealed class StubValidTargetResultFactory : IGameValidTargetResultFactory
    {
        public ValidTargetResult Create(GameEffectTargetReference target, GameState gameState)
        {
            return new ValidTargetResult();
        }
    }

    private sealed class StubConditionDiagnostics : IGameEffectConditionDiagnostics
    {
        public string BuildFailureMessage(EffectContextCondition condition)
        {
            return "condition failed";
        }
    }
}
