using ErrorOr;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class GameSequentialEffectExecutorTests
{
    [TestMethod]
    public void Execute_RunsEffectsInDefinitionOrder()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RecordingEffect(SummonCardEffect.EffectKey, observedSpecIds),
            new RecordingEffect(ModifyAttributeEffect.EffectKey, observedSpecIds),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "step-1",
                RuntimeEffectType = RuntimeEffects.SummonCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "step-2",
                RuntimeEffectType = RuntimeEffects.ChangeValues,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        var context = CreateContext(sourceDefinition);

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        CollectionAssert.AreEqual(new[] { "step-1", "step-2" }, observedSpecIds.ToArray());
    }

    [TestMethod]
    public void Execute_StopsWhenEffectReturnsError()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RecordingEffect(SummonCardEffect.EffectKey, observedSpecIds),
            new FailingEffect(ModifyAttributeEffect.EffectKey),
            new RecordingEffect(DestroyCardEffect.EffectKey, observedSpecIds),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "step-1",
                RuntimeEffectType = RuntimeEffects.SummonCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "step-2",
                RuntimeEffectType = RuntimeEffects.ChangeValues,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "step-3",
                RuntimeEffectType = RuntimeEffects.DestroyCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        var context = CreateContext(sourceDefinition);

        var result = executor.Execute(context);

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Game.Effect.Sequential.StepFailed", result.FirstError.Code);
        CollectionAssert.AreEqual(new[] { "step-1" }, observedSpecIds.ToArray());
    }

    [TestMethod]
    public void Resolve_UsesActiveEffectSpecIdArgument_WhenProvided()
    {
        var resolver = new GameRuntimeEffectSpecResolver();
        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "first",
                RuntimeEffectType = RuntimeEffects.ChangeValues,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "second",
                RuntimeEffectType = RuntimeEffects.ChangeValues,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        var context = CreateContext(
            sourceDefinition,
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                [ReactiveEffectExecutionConstants.ActiveEffectSpecIdArgument] = "second",
            });

        var resolved = resolver.Resolve(context, RuntimeEffects.ChangeValues);

        Assert.IsNotNull(resolved);
        Assert.AreEqual("second", resolved.Id);
    }

    [TestMethod]
    public void Execute_UsesSourceCardTarget_WhenEffectConfiguredWithSourceCardTargetSource()
    {
        IReadOnlyList<GameEffectTargetReference>? observedTargets = null;
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new InspectingTargetsEffect(
                SummonCardEffect.EffectKey,
                targets => observedTargets = targets),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "step-source",
                RuntimeEffectType = RuntimeEffects.SummonCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ExecutionTargetSource = EffectExecutionTargetSource.SourceCard,
                ContextRules = []
            });

        var context = CreateContext(sourceDefinition);

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        Assert.IsNotNull(observedTargets);
        Assert.AreEqual(1, observedTargets.Count);
        Assert.AreEqual("source-1", observedTargets[0].CardInstanceId);
        Assert.AreEqual(PlayerZone.CharacterField, observedTargets[0].Zone);
        Assert.AreEqual("p1", observedTargets[0].PlayerId);
    }

    [TestMethod]
    public void Execute_UsesConditionalBranching_ForChoiceDrivenEffects()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RecordingEffect(ModifyAttributeEffect.EffectKey, observedSpecIds),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "option-a",
                RuntimeEffectType = RuntimeEffects.ChangeValues,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ExecutionCondition = new EffectExecutionConditionSpec
                {
                    ArgumentKey = "selectedOption",
                    ExpectedValue = "A",
                },
                OnFailureEffectId = "option-b",
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "option-b",
                RuntimeEffectType = RuntimeEffects.ChangeValues,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ExecutionCondition = new EffectExecutionConditionSpec
                {
                    ArgumentKey = "selectedOption",
                    ExpectedValue = "B",
                },
                ContextRules = []
            });

        var context = CreateContext(
            sourceDefinition,
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["selectedOption"] = "B",
            });

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        CollectionAssert.AreEqual(new[] { "option-b" }, observedSpecIds.ToArray());
    }

    [TestMethod]
    public void Execute_UsesFallbackBranch_WhenInitialEffectExecutionFails()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new FailingEffect(ModifyAttributeEffect.EffectKey),
            new RecordingEffect(DestroyCardEffect.EffectKey, observedSpecIds),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "initial",
                RuntimeEffectType = RuntimeEffects.ChangeValues,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                OnFailureEffectId = "fallback",
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "fallback",
                RuntimeEffectType = RuntimeEffects.DestroyCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        var context = CreateContext(sourceDefinition);

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        CollectionAssert.AreEqual(new[] { "fallback" }, observedSpecIds.ToArray());
    }

    [TestMethod]
    public void Execute_AtomicChain_DoesNotExecuteAnyStep_WhenLaterStepCannotExecute()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RecordingEffect(SummonCardEffect.EffectKey, observedSpecIds),
            new CannotExecuteEffect(ModifyAttributeEffect.EffectKey),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "summon-self",
                RuntimeEffectType = RuntimeEffects.SummonCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ExecutionFlowMode = EffectExecutionFlowMode.AtomicChain,
                OnSuccessEffectId = "double-power",
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "double-power",
                RuntimeEffectType = RuntimeEffects.ChangeValues,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ExecutionFlowMode = EffectExecutionFlowMode.AtomicChain,
                ContextRules = []
            });

        var context = CreateContext(sourceDefinition);

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(0, observedSpecIds.Count);
    }

    [TestMethod]
    public void Execute_AtomicChain_ExecutesAllSteps_WhenWholeChainIsValid()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RecordingEffect(SummonCardEffect.EffectKey, observedSpecIds),
            new RecordingEffect(ModifyAttributeEffect.EffectKey, observedSpecIds),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "summon-self",
                RuntimeEffectType = RuntimeEffects.SummonCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ExecutionFlowMode = EffectExecutionFlowMode.AtomicChain,
                OnSuccessEffectId = "double-power",
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "double-power",
                RuntimeEffectType = RuntimeEffects.ChangeValues,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ExecutionFlowMode = EffectExecutionFlowMode.AtomicChain,
                ContextRules = []
            });

        var context = CreateContext(sourceDefinition);

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        CollectionAssert.AreEqual(new[] { "summon-self", "double-power" }, observedSpecIds.ToArray());
    }

    [TestMethod]
    public void Execute_AtomicChain_IgnoresNonEntryConditions()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RecordingEffect(SummonCardEffect.EffectKey, observedSpecIds),
            new RecordingEffect(ModifyAttributeEffect.EffectKey, observedSpecIds),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "summon-self",
                RuntimeEffectType = RuntimeEffects.SummonCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ExecutionFlowMode = EffectExecutionFlowMode.AtomicChain,
                OnSuccessEffectId = "double-power",
                ExecutionCondition = new EffectExecutionConditionSpec
                {
                    ArgumentKey = "canResolve",
                    ExpectedValue = "yes",
                },
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "double-power",
                RuntimeEffectType = RuntimeEffects.ChangeValues,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ExecutionFlowMode = EffectExecutionFlowMode.AtomicChain,
                ExecutionCondition = new EffectExecutionConditionSpec
                {
                    ArgumentKey = "shouldBeIgnored",
                    ExpectedValue = "never-set",
                },
                ContextRules = []
            });

        var context = CreateContext(
            sourceDefinition,
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["canResolve"] = "yes",
            });

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        CollectionAssert.AreEqual(new[] { "summon-self", "double-power" }, observedSpecIds.ToArray());
    }

    [TestMethod]
    public void Execute_DoesNotCharge_WhenEffectHasNoChakraCost()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RecordingEffect(SummonCardEffect.EffectKey, observedSpecIds),
            new RecordingEffect(ModifyAttributeEffect.EffectKey, observedSpecIds),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "support-a",
                RuntimeEffectType = RuntimeEffects.SummonCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.SupportActivated,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "support-b",
                RuntimeEffectType = RuntimeEffects.ChangeValues,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.SupportActivated,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        var context = CreateContext(sourceDefinition, playerOneResource: 5);

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(5, context.Game.State.Players[0].ResourcePool);
        CollectionAssert.AreEqual(new[] { "support-a", "support-b" }, observedSpecIds.ToArray());
    }

    [TestMethod]
    public void Execute_BranchesOnFailure_WhenSupportEffectChakraCostCannotBePaid()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RecordingEffect(SummonCardEffect.EffectKey, observedSpecIds),
            new RecordingEffect(DestroyCardEffect.EffectKey, observedSpecIds),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "support-main",
                RuntimeEffectType = RuntimeEffects.SummonCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.SupportActivated,
                ChakraCost = 2,
                TargetRange = EffectTargetRange.Any,
                OnFailureEffectId = "fallback",
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "fallback",
                RuntimeEffectType = RuntimeEffects.DestroyCard,
                EffectType = EffectKind.Unknown,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        var context = CreateContext(sourceDefinition, playerOneResource: 1);

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(1, context.Game.State.Players[0].ResourcePool);
        CollectionAssert.AreEqual(new[] { "fallback" }, observedSpecIds.ToArray());
    }

    [TestMethod]
    public void Execute_UsesEffectLevelChakraCost_WhenProvidedForSupportEffect()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RecordingEffect(SummonCardEffect.EffectKey, observedSpecIds),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "support-main",
                RuntimeEffectType = RuntimeEffects.SummonCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.SupportActivated,
                ChakraCost = 1,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        var context = CreateContext(sourceDefinition, playerOneResource: 4);

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(3, context.Game.State.Players[0].ResourcePool);
        CollectionAssert.AreEqual(new[] { "support-main" }, observedSpecIds.ToArray());
    }

    [TestMethod]
    public void Execute_UsesEffectLevelChakraCost_WhenProvidedForNonSupportEffect()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RecordingEffect(SummonCardEffect.EffectKey, observedSpecIds),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "activated-main",
                RuntimeEffectType = RuntimeEffects.SummonCard,
                EffectType = EffectKind.Activated,
                Timing = EffectTiming.ActivateMain,
                ChakraCost = 2,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        var context = CreateContext(sourceDefinition, playerOneResource: 5);

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(3, context.Game.State.Players[0].ResourcePool);
        CollectionAssert.AreEqual(new[] { "activated-main" }, observedSpecIds.ToArray());
    }

    [TestMethod]
    public void Execute_BranchesOnFailure_WhenNonSupportEffectChakraCostCannotBePaid()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RecordingEffect(SummonCardEffect.EffectKey, observedSpecIds),
            new RecordingEffect(DestroyCardEffect.EffectKey, observedSpecIds),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "activated-main",
                RuntimeEffectType = RuntimeEffects.SummonCard,
                EffectType = EffectKind.Activated,
                Timing = EffectTiming.ActivateMain,
                ChakraCost = 2,
                TargetRange = EffectTargetRange.Any,
                OnFailureEffectId = "fallback",
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "fallback",
                RuntimeEffectType = RuntimeEffects.DestroyCard,
                EffectType = EffectKind.Unknown,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        var context = CreateContext(sourceDefinition, playerOneResource: 1);

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(1, context.Game.State.Players[0].ResourcePool);
        CollectionAssert.AreEqual(new[] { "fallback" }, observedSpecIds.ToArray());
    }

    private static GameCardEffectContext CreateContext(
        Card sourceDefinition,
        IReadOnlyDictionary<string, string>? arguments = null,
        int playerOneResource = 0)
    {
        var sourceCard = new CardInstance
        {
            InstanceId = "source-1",
            CardDefinitionId = "source-def",
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
        };

        var state = new GameState
        {
            GameId = "game-seq-1",
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
                new PlayerState { PlayerId = "p2" },
            ],
            CardDefinitions =
            {
                ["source-def"] = sourceDefinition,
            }
        };

        var game = new GameInstance(state);

        return new GameCardEffectContext(
            game: game,
            actingPlayer: new Player
            {
                Id = "p1",
                Name = "Player 1",
                DisplayName = "Player 1",
                Deck = []
            },
            sourceCardDefinition: sourceDefinition,
            sourceCardInstance: sourceCard,
            arguments: arguments ?? new Dictionary<string, string>(StringComparer.Ordinal),
            selectedTargets: []);
    }

    private static CharacterCard CreateSourceDefinition(params EffectSpec[] effects)
    {
        return new CharacterCard
        {
            Id = "source-def",
            DisplayName = "Source",
            Name = ["Source"],
            Type = CardType.Character,
            Color = CardColor.Blue,
            Traits = ["Ninja"],
            Description = string.Empty,
            Damage = 1,
            Power = 1,
            Health = 2,
            Effects = effects.ToList(),
        };
    }

    private sealed class RecordingEffect : IGameCardEffect
    {
        private readonly List<string> observedSpecIds;

        public RecordingEffect(string effectTypeKey, List<string> observedSpecIds)
        {
            EffectTypeKey = effectTypeKey;
            this.observedSpecIds = observedSpecIds;
        }

        public string EffectTypeKey { get; }

        public CanExecuteResult CanExecute(GameCardEffectContext context)
        {
            return new CanExecuteResult { CanExecute = true };
        }

        public IReadOnlyList<GameEffectTargetReference> GetValidTargets(GameCardEffectContext context)
        {
            return [];
        }

        public ErrorOr<Success> Execute(GameCardEffectContext context, IReadOnlyList<GameEffectTargetReference> selectedTargets)
        {
            Assert.IsTrue(context.Arguments.TryGetValue(ReactiveEffectExecutionConstants.ActiveEffectSpecIdArgument, out var activeEffectSpecId));
            observedSpecIds.Add(activeEffectSpecId!);
            return Result.Success;
        }
    }

    private sealed class FailingEffect(string effectTypeKey) : IGameCardEffect
    {
        public string EffectTypeKey { get; } = effectTypeKey;

        public CanExecuteResult CanExecute(GameCardEffectContext context)
        {
            return new CanExecuteResult { CanExecute = true };
        }

        public IReadOnlyList<GameEffectTargetReference> GetValidTargets(GameCardEffectContext context)
        {
            return [];
        }

        public ErrorOr<Success> Execute(GameCardEffectContext context, IReadOnlyList<GameEffectTargetReference> selectedTargets)
        {
            return Error.Validation(
                code: "Game.Effect.Sequential.StepFailed",
                description: "Intentional failure for testing fail-fast behavior.");
        }
    }

    private sealed class InspectingTargetsEffect(
        string effectTypeKey,
        Action<IReadOnlyList<GameEffectTargetReference>> onExecute) : IGameCardEffect
    {
        public string EffectTypeKey { get; } = effectTypeKey;

        public CanExecuteResult CanExecute(GameCardEffectContext context)
        {
            return new CanExecuteResult { CanExecute = true };
        }

        public IReadOnlyList<GameEffectTargetReference> GetValidTargets(GameCardEffectContext context)
        {
            return [];
        }

        public ErrorOr<Success> Execute(GameCardEffectContext context, IReadOnlyList<GameEffectTargetReference> selectedTargets)
        {
            onExecute(selectedTargets);
            return Result.Success;
        }
    }

    private sealed class CannotExecuteEffect(string effectTypeKey) : IGameCardEffect
    {
        public string EffectTypeKey { get; } = effectTypeKey;

        public CanExecuteResult CanExecute(GameCardEffectContext context)
        {
            return new CanExecuteResult { CanExecute = false };
        }

        public IReadOnlyList<GameEffectTargetReference> GetValidTargets(GameCardEffectContext context)
        {
            return [];
        }

        public ErrorOr<Success> Execute(GameCardEffectContext context, IReadOnlyList<GameEffectTargetReference> selectedTargets)
        {
            Assert.Fail("Execute should not be called when CanExecute is false.");
            return Result.Success;
        }
    }
}