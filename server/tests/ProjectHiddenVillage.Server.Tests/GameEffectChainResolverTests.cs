using ErrorOr;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class GameEffectChainResolverTests
{
    [TestMethod]
    public void Resolve_ProcessesStackInLifoOrder_AndSkipsNegatedEntries()
    {
        var executionOrder = new List<string>();
        var resolver = new GameEffectChainResolver(new GameCardEffectRegistry(
        [
            new RecordingEffect("ResolveA", executionOrder),
            new RecordingEffect("ResolveB", executionOrder),
            new RecordingEffect("ResolveC", executionOrder),
        ]));

        var game = CreateGameWithStack(
            new EffectResolutionStackEntry
            {
                EntryId = "a",
                SourcePlayerId = "p1",
                SourceZone = PlayerZone.CharacterField,
                SourceCardInstanceId = "source-1",
                EffectTypeKey = "ResolveA",
                IsNegated = false,
            },
            new EffectResolutionStackEntry
            {
                EntryId = "b",
                SourcePlayerId = "p1",
                SourceZone = PlayerZone.CharacterField,
                SourceCardInstanceId = "source-1",
                EffectTypeKey = "ResolveB",
                IsNegated = true,
            },
            new EffectResolutionStackEntry
            {
                EntryId = "c",
                SourcePlayerId = "p1",
                SourceZone = PlayerZone.CharacterField,
                SourceCardInstanceId = "source-1",
                EffectTypeKey = "ResolveC",
                IsNegated = false,
            });

        var result = resolver.Resolve(game, actingPlayerId: "p1", new PassiveChainResolutionOptions());

        Assert.IsFalse(result.IsError);
        CollectionAssert.AreEqual(new[] { "c", "a" }, result.Value.ResolvedStackEntryIds.ToArray());
        CollectionAssert.AreEqual(new[] { "b" }, result.Value.SkippedNegatedEntryIds.ToArray());
        CollectionAssert.AreEqual(new[] { "ResolveC", "ResolveA" }, executionOrder.ToArray());
        Assert.AreEqual(0, game.State.EffectResolutionStack.Count);
    }

    [TestMethod]
    public void Resolve_StopsAtMaxEntriesPerCycle_LeavingRemainingStackEntries()
    {
        var executionOrder = new List<string>();
        var resolver = new GameEffectChainResolver(new GameCardEffectRegistry(
        [
            new RecordingEffect("ResolveA", executionOrder),
            new RecordingEffect("ResolveB", executionOrder),
            new RecordingEffect("ResolveC", executionOrder),
        ]));

        var game = CreateGameWithStack(
            new EffectResolutionStackEntry
            {
                EntryId = "a",
                SourcePlayerId = "p1",
                SourceZone = PlayerZone.CharacterField,
                SourceCardInstanceId = "source-1",
                EffectTypeKey = "ResolveA",
            },
            new EffectResolutionStackEntry
            {
                EntryId = "b",
                SourcePlayerId = "p1",
                SourceZone = PlayerZone.CharacterField,
                SourceCardInstanceId = "source-1",
                EffectTypeKey = "ResolveB",
            },
            new EffectResolutionStackEntry
            {
                EntryId = "c",
                SourcePlayerId = "p1",
                SourceZone = PlayerZone.CharacterField,
                SourceCardInstanceId = "source-1",
                EffectTypeKey = "ResolveC",
            });

        var result = resolver.Resolve(
            game,
            actingPlayerId: "p1",
            new PassiveChainResolutionOptions
            {
                MaxEntriesPerCycle = 2,
                MaxDepth = 10,
            });

        Assert.IsFalse(result.IsError);
        CollectionAssert.AreEqual(new[] { "c", "b" }, result.Value.ResolvedStackEntryIds.ToArray());
        CollectionAssert.AreEqual(new[] { "ResolveC", "ResolveB" }, executionOrder.ToArray());
        Assert.AreEqual(1, game.State.EffectResolutionStack.Count);
        Assert.AreEqual("a", game.State.EffectResolutionStack[0].EntryId);
    }

    [TestMethod]
    public void Resolve_PassesTranslatedTargetsAndArguments_ToEffectExecutionContext()
    {
        var observedTargets = new List<GameEffectTargetReference>();
        var observedArguments = new Dictionary<string, string>(StringComparer.Ordinal);

        var resolver = new GameEffectChainResolver(new GameCardEffectRegistry(
        [
            new InspectingEffect(
                effectTypeKey: "Inspect",
                onExecute: context =>
                {
                    observedTargets.AddRange(context.SelectedTargets);
                    foreach (var (key, value) in context.Arguments)
                    {
                        observedArguments[key] = value;
                    }
                })
        ]));

        var game = CreateGameWithStack(
            new EffectResolutionStackEntry
            {
                EntryId = "inspect-entry",
                SourcePlayerId = "p1",
                SourceZone = PlayerZone.CharacterField,
                SourceCardInstanceId = "source-1",
                EffectTypeKey = "Inspect",
                SelectedTargets =
                [
                    new GameEffectTargetReference(
                        PlayerId: "p2",
                        Zone: PlayerZone.CharacterField,
                        CardInstanceId: "target-1")
                ],
                Arguments = new Dictionary<string, string>(StringComparer.Ordinal)
                {
                    ["summonTargetId"] = "target-1",
                }
            });

        game.State.Players[1].Battlefield.Add(new CardInstance
        {
            InstanceId = "target-1",
            CardDefinitionId = "def-1",
            OwnerPlayerId = "p2",
            ControllerPlayerId = "p2",
        });

        var result = resolver.Resolve(game, actingPlayerId: "p1", new PassiveChainResolutionOptions());

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(1, observedTargets.Count);
        Assert.AreEqual("target-1", observedTargets[0].CardInstanceId);
        Assert.IsTrue(observedArguments.ContainsKey("summonTargetId"));
        Assert.AreEqual("target-1", observedArguments["summonTargetId"]);
        Assert.IsTrue(observedArguments.ContainsKey(ReactiveEffectExecutionConstants.SkipReactiveOrchestrationArgument));
    }

    [TestMethod]
    public void Resolve_StrictMode_FailsWhenExpectedTargetsAreMissing()
    {
        var executionOrder = new List<string>();
        var resolver = new GameEffectChainResolver(new GameCardEffectRegistry(
        [
            new RecordingEffect("ResolveStrict", executionOrder),
        ]));

        var game = CreateGameWithStack(
            new EffectResolutionStackEntry
            {
                EntryId = "strict-entry",
                SourcePlayerId = "p1",
                SourceZone = PlayerZone.CharacterField,
                SourceCardInstanceId = "source-1",
                EffectTypeKey = "ResolveStrict",
                SelectedTargets =
                [
                    new GameEffectTargetReference(
                        PlayerId: "p2",
                        Zone: PlayerZone.CharacterField,
                        CardInstanceId: "missing-1")
                ],
                Arguments = new Dictionary<string, string>(StringComparer.Ordinal)
                {
                    [ReactiveEffectExecutionConstants.ExpectedTriggerTargetIdsArgument] = "missing-1",
                }
            });

        var result = resolver.Resolve(
            game,
            actingPlayerId: "p1",
            new PassiveChainResolutionOptions
            {
                ConsequenceTargetValidationMode = ConsequenceTargetValidationMode.Strict,
            });

        Assert.IsFalse(result.IsError);
        Assert.AreEqual("strict-entry", result.Value.FailedEntryId);
        StringAssert.Contains(result.Value.FailureReason, "missing-1");
        Assert.AreEqual(0, executionOrder.Count);
    }

    [TestMethod]
    public void Resolve_PermissiveMode_RemapsMovedTargetAndContinues()
    {
        var observedTargets = new List<GameEffectTargetReference>();
        var resolver = new GameEffectChainResolver(new GameCardEffectRegistry(
        [
            new InspectingEffect(
                effectTypeKey: "ResolvePermissive",
                onExecute: context => observedTargets.AddRange(context.SelectedTargets)),
        ]));

        var game = CreateGameWithStack(
            new EffectResolutionStackEntry
            {
                EntryId = "permissive-entry",
                SourcePlayerId = "p1",
                SourceZone = PlayerZone.CharacterField,
                SourceCardInstanceId = "source-1",
                EffectTypeKey = "ResolvePermissive",
                SelectedTargets =
                [
                    new GameEffectTargetReference(
                        PlayerId: "p2",
                        Zone: PlayerZone.CharacterField,
                        CardInstanceId: "target-2")
                ],
                Arguments = new Dictionary<string, string>(StringComparer.Ordinal)
                {
                    [ReactiveEffectExecutionConstants.ExpectedTriggerTargetIdsArgument] = "target-2",
                }
            });

        game.State.Players[1].Hand.Add(new CardInstance
        {
            InstanceId = "target-2",
            CardDefinitionId = "def-1",
            OwnerPlayerId = "p2",
            ControllerPlayerId = "p2",
        });

        var result = resolver.Resolve(
            game,
            actingPlayerId: "p1",
            new PassiveChainResolutionOptions
            {
                ConsequenceTargetValidationMode = ConsequenceTargetValidationMode.Permissive,
            });

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(string.Empty, result.Value.FailedEntryId);
        Assert.AreEqual(1, observedTargets.Count);
        Assert.AreEqual("target-2", observedTargets[0].CardInstanceId);
        Assert.AreEqual(PlayerZone.Hand, observedTargets[0].Zone);
        Assert.AreEqual("p2", observedTargets[0].PlayerId);
    }

    private static GameInstance CreateGameWithStack(params EffectResolutionStackEntry[] entries)
    {
        var sourceCardInstance = new CardInstance
        {
            InstanceId = "source-1",
            CardDefinitionId = "def-1",
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
        };

        var playerOne = new PlayerState
        {
            PlayerId = "p1",
            Battlefield = [sourceCardInstance],
        };

        var playerTwo = new PlayerState
        {
            PlayerId = "p2",
        };

        var cardDefinition = new CharacterCard
        {
            Id = "def-1",
            DisplayName = "Source",
            Name = ["Source"],
            Type = CardType.Character,
            Color = CardColor.Red,
            Traits = ["Ninja"],
            Description = string.Empty,
            Damage = 1,
            Power = 1,
            Health = 2,
        };

        var state = new GameState
        {
            GameId = "game-1",
            ActivePlayerId = "p1",
            PriorityPlayerId = "p1",
            Players = [playerOne, playerTwo],
            CardDefinitions =
            {
                ["def-1"] = cardDefinition,
            },
            EffectResolutionStack = entries.ToList(),
        };

        return new GameInstance(state);
    }

    private sealed class RecordingEffect : IGameCardEffect
    {
        private readonly string effectTypeKey;
        private readonly List<string> executionOrder;

        public RecordingEffect(string effectTypeKey, List<string> executionOrder)
        {
            this.effectTypeKey = effectTypeKey;
            this.executionOrder = executionOrder;
        }

        public string EffectTypeKey => effectTypeKey;

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
            executionOrder.Add(effectTypeKey);

            Assert.IsTrue(
                context.Arguments.TryGetValue(ReactiveEffectExecutionConstants.SkipReactiveOrchestrationArgument, out var flag)
                && bool.TryParse(flag, out var shouldSkip)
                && shouldSkip,
                "Stack-driven effect execution must suppress recursive orchestration.");

            return Result.Success;
        }
    }

    private sealed class InspectingEffect : IGameCardEffect
    {
        private readonly Action<GameCardEffectContext> onExecute;

        public InspectingEffect(string effectTypeKey, Action<GameCardEffectContext> onExecute)
        {
            EffectTypeKey = effectTypeKey;
            this.onExecute = onExecute;
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
            onExecute(context);
            return Result.Success;
        }
    }
}