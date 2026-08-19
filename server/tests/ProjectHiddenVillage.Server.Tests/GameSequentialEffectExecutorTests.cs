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

    private static GameCardEffectContext CreateContext(
        Card sourceDefinition,
        IReadOnlyDictionary<string, string>? arguments = null)
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
}