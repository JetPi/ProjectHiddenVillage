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
        IReadOnlyList<GameEffectTargetReference>? selectedTargets = null)
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
                    Battlefield = [sourceCard],
                },
                new PlayerState
                {
                    PlayerId = "p2",
                }
            ],
            CardDefinitions =
            {
                ["source-def"] = sourceDefinition,
            }
        };

        return new GameCardEffectContext(
            game: new GameInstance(state),
            actingPlayer: new Player { Id = "p1" },
            sourceCardDefinition: sourceDefinition,
            sourceCardInstance: sourceCard,
            arguments: arguments,
                selectedTargets: selectedTargets ?? []);
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
