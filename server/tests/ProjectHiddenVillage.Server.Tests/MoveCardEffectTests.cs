using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class MoveCardEffectTests
{
    [TestMethod]
    public void Execute_DrawMode_DrawsConfiguredCount()
    {
        var effectSpec = CreateMoveCardEffectSpec(
            new MoveCardActionSpec
            {
                Operation = MoveCardOperationType.Draw,
                DrawCount = 2,
            });
        var context = CreateContext(effectSpec);

        var effect = CreateEffect(effectSpec);
        var result = effect.Execute(context, []);

        Assert.IsFalse(result.IsError);

        var player = context.Game.State.Players.First(player => player.PlayerId == "p1");
        Assert.AreEqual(4, player.Hand.Count);
        Assert.AreEqual(0, player.Deck.Count);
        var handIds = player.Hand.Select(card => card.InstanceId).ToHashSet(StringComparer.Ordinal);
        Assert.IsTrue(handIds.Contains("deck-1"));
        Assert.IsTrue(handIds.Contains("deck-2"));
    }

    [TestMethod]
    public void Execute_MoveMode_MovesSelectedTargetFromHandToDeckTop()
    {
        var effectSpec = CreateMoveCardEffectSpec(
            new MoveCardActionSpec
            {
                Operation = MoveCardOperationType.Move,
                SourceZone = PlayerZone.Hand,
                DestinationZone = PlayerZone.Deck,
                DestinationIndex = 0,
                DestinationPlayerRange = EffectTargetRange.Self,
            });
        var context = CreateContext(effectSpec, selectedTargets:
        [
            new GameEffectTargetReference("p1", PlayerZone.Hand, "hand-1")
        ]);

        var effect = CreateEffect(effectSpec);
        var result = effect.Execute(context, context.SelectedTargets);

        Assert.IsFalse(result.IsError);

        var player = context.Game.State.Players.First(entry => entry.PlayerId == "p1");
        Assert.AreEqual(1, player.Hand.Count);
        Assert.AreEqual(3, player.Deck.Count);
        Assert.AreEqual("hand-1", player.Deck[0].InstanceId);
    }

    [TestMethod]
    public void Execute_MoveMode_MovesSelectedTargetToDeckBottom_WhenPlacementIsBottom()
    {
        var effectSpec = CreateMoveCardEffectSpec(
            new MoveCardActionSpec
            {
                Operation = MoveCardOperationType.Move,
                SourceZone = PlayerZone.Hand,
                DestinationZone = PlayerZone.Deck,
                DeckPlacement = MoveCardDeckPlacementType.Bottom,
                DestinationPlayerRange = EffectTargetRange.Self,
            });
        var context = CreateContext(effectSpec, selectedTargets:
        [
            new GameEffectTargetReference("p1", PlayerZone.Hand, "hand-1")
        ]);

        var effect = CreateEffect(effectSpec);
        var result = effect.Execute(context, context.SelectedTargets);

        Assert.IsFalse(result.IsError);

        var player = context.Game.State.Players.First(entry => entry.PlayerId == "p1");
        Assert.AreEqual(1, player.Hand.Count);
        Assert.AreEqual(3, player.Deck.Count);
        Assert.AreEqual("hand-1", player.Deck[2].InstanceId);
    }

    [TestMethod]
    public void Execute_MoveMode_ShufflesSelectedTargets_WhenOrderingIsRandomAndSeedIsProvided()
    {
        var effectSpec = CreateMoveCardEffectSpec(
            new MoveCardActionSpec
            {
                Operation = MoveCardOperationType.Move,
                SourceZone = PlayerZone.Hand,
                DestinationZone = PlayerZone.Deck,
                DeckPlacement = MoveCardDeckPlacementType.Bottom,
                MultiCardOrdering = MoveCardMultiCardOrderingType.Random,
                DestinationPlayerRange = EffectTargetRange.Self,
            });

        var context = CreateContext(
            effectSpec,
            selectedTargets:
            [
                new GameEffectTargetReference("p1", PlayerZone.Hand, "hand-1"),
                new GameEffectTargetReference("p1", PlayerZone.Hand, "hand-2")
            ],
            arguments: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["moveCardRandomSeed"] = "21",
            });

        var effect = CreateEffect(effectSpec);
        var result = effect.Execute(context, context.SelectedTargets);

        Assert.IsFalse(result.IsError);

        var player = context.Game.State.Players.First(entry => entry.PlayerId == "p1");
        Assert.AreEqual(0, player.Hand.Count);
        Assert.AreEqual(4, player.Deck.Count);
        Assert.AreEqual("hand-1", player.Deck[2].InstanceId);
        Assert.AreEqual("hand-2", player.Deck[3].InstanceId);
    }

    [TestMethod]
    public void Execute_MoveMode_MovesOnlyConfiguredMoveCount()
    {
        var effectSpec = CreateMoveCardEffectSpec(
            new MoveCardActionSpec
            {
                Operation = MoveCardOperationType.Move,
                SourceZone = PlayerZone.Hand,
                DestinationZone = PlayerZone.Deck,
                MoveCount = 1,
                DeckPlacement = MoveCardDeckPlacementType.Bottom,
                MultiCardOrdering = MoveCardMultiCardOrderingType.SelectedOrder,
                DestinationPlayerRange = EffectTargetRange.Self,
            });

        var context = CreateContext(
            effectSpec,
            selectedTargets:
            [
                new GameEffectTargetReference("p1", PlayerZone.Hand, "hand-1"),
                new GameEffectTargetReference("p1", PlayerZone.Hand, "hand-2")
            ]);

        var effect = CreateEffect(effectSpec);
        var result = effect.Execute(context, context.SelectedTargets);

        Assert.IsFalse(result.IsError);

        var player = context.Game.State.Players.First(entry => entry.PlayerId == "p1");
        Assert.AreEqual(1, player.Hand.Count);
        Assert.AreEqual("hand-2", player.Hand[0].InstanceId);
        Assert.AreEqual(3, player.Deck.Count);
        Assert.AreEqual("hand-1", player.Deck[2].InstanceId);
    }

    [TestMethod]
    public void Execute_MoveMode_AllowsCrossPlayerMove_WhenExplicitlyEnabled()
    {
        var effectSpec = CreateMoveCardEffectSpec(
            new MoveCardActionSpec
            {
                Operation = MoveCardOperationType.Move,
                SourceZone = PlayerZone.Hand,
                DestinationZone = PlayerZone.Trash,
                AllowCrossPlayer = true,
                DestinationPlayerRange = EffectTargetRange.Opponent,
            });
        var context = CreateContext(
            effectSpec,
            selectedTargets:
            [
                new GameEffectTargetReference("p1", PlayerZone.Hand, "hand-1")
            ]);

        var effect = CreateEffect(effectSpec);
        var result = effect.Execute(context, context.SelectedTargets);

        Assert.IsFalse(result.IsError);

        var sourcePlayer = context.Game.State.Players.First(player => player.PlayerId == "p1");
        var destinationPlayer = context.Game.State.Players.First(player => player.PlayerId == "p2");

        Assert.AreEqual(1, sourcePlayer.Hand.Count);
        Assert.AreEqual(1, destinationPlayer.DiscardPile.Count);
        Assert.AreEqual("hand-1", destinationPlayer.DiscardPile[0].InstanceId);
        Assert.AreEqual("p2", destinationPlayer.DiscardPile[0].ControllerPlayerId);
    }

    [TestMethod]
    public void Execute_MoveMode_ReturnsError_WhenCrossPlayerMoveNotEnabled()
    {
        var effectSpec = CreateMoveCardEffectSpec(
            new MoveCardActionSpec
            {
                Operation = MoveCardOperationType.Move,
                SourceZone = PlayerZone.Hand,
                DestinationZone = PlayerZone.Trash,
                AllowCrossPlayer = false,
                DestinationPlayerRange = EffectTargetRange.Opponent,
            });
        var context = CreateContext(
            effectSpec,
            selectedTargets:
            [
                new GameEffectTargetReference("p1", PlayerZone.Hand, "hand-1")
            ]);

        var effect = CreateEffect(effectSpec);
        var result = effect.Execute(context, context.SelectedTargets);

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Game.Effect.MoveCard.Move.InvalidOperation", result.FirstError.Code);
    }

    private static MoveCardEffect CreateEffect(EffectSpec effectSpec)
    {
        return new MoveCardEffect(
            effectSpecResolver: new StubEffectSpecResolver(effectSpec),
            canExecuteEvaluator: new StubCanExecuteEvaluator(),
            targetResolver: new StubTargetResolver(),
            runtimeDeckService: new GameRuntimeDeckService(new GameEffectHandlingService()));
    }

    private static EffectSpec CreateMoveCardEffectSpec(params MoveCardActionSpec[] actions)
    {
        return new EffectSpec
        {
            Id = "move-step",
            RuntimeEffectType = RuntimeEffects.MoveCard,
            EffectType = EffectKind.Activated,
            Timing = EffectTiming.ActivateMain,
            TargetRange = EffectTargetRange.Self,
            ContextRules = [],
            MoveCardActions = actions,
            TargetRules = new EffectTargetRuleSet
            {
                Rules = []
            }
        };
    }

    private static GameCardEffectContext CreateContext(
        EffectSpec effectSpec,
        IReadOnlyList<GameEffectTargetReference>? selectedTargets = null,
        IReadOnlyDictionary<string, string>? arguments = null)
    {
        var sourceDefinition = new CharacterCard
        {
            Id = "source-def",
            DisplayName = "Source",
            Name = ["Source"],
            Type = CardType.Character,
            Color = CardColor.Green,
            Traits = [],
            Description = string.Empty,
            Damage = 1,
            Power = 1,
            Health = 1,
            Effects = [effectSpec]
        };

        var state = new GameState
        {
            GameId = "game-move-1",
            TurnNumber = 1,
            ActivePlayerId = "p1",
            PriorityPlayerId = "p1",
            CardDefinitions =
            {
                ["source-def"] = sourceDefinition,
                ["card-1"] = new CharacterCard
                {
                    Id = "card-1",
                    DisplayName = "Card 1",
                    Name = ["Card 1"],
                    Type = CardType.Character,
                    Color = CardColor.Blue,
                    Traits = [],
                    Damage = 1,
                    Power = 1,
                    Health = 1,
                },
                ["card-2"] = new CharacterCard
                {
                    Id = "card-2",
                    DisplayName = "Card 2",
                    Name = ["Card 2"],
                    Type = CardType.Character,
                    Color = CardColor.Red,
                    Traits = [],
                    Damage = 1,
                    Power = 1,
                    Health = 1,
                }
            },
            Players =
            [
                new PlayerState
                {
                    PlayerId = "p1",
                    Hand =
                    [
                        new CardInstance
                        {
                            InstanceId = "hand-1",
                            CardDefinitionId = "card-1",
                            OwnerPlayerId = "p1",
                            ControllerPlayerId = "p1",
                        },
                        new CardInstance
                        {
                            InstanceId = "hand-2",
                            CardDefinitionId = "card-2",
                            OwnerPlayerId = "p1",
                            ControllerPlayerId = "p1",
                        }
                    ],
                    Deck =
                    [
                        new CardInstance
                        {
                            InstanceId = "deck-1",
                            CardDefinitionId = "card-1",
                            OwnerPlayerId = "p1",
                            ControllerPlayerId = "p1",
                        },
                        new CardInstance
                        {
                            InstanceId = "deck-2",
                            CardDefinitionId = "card-2",
                            OwnerPlayerId = "p1",
                            ControllerPlayerId = "p1",
                        }
                    ]
                },
                new PlayerState
                {
                    PlayerId = "p2"
                }
            ]
        };

        var resolvedArguments = arguments ?? new Dictionary<string, string>(StringComparer.Ordinal);

        return new GameCardEffectContext(
            game: new GameInstance(state),
            actingPlayer: new Player { Id = "p1" },
            sourceCardDefinition: sourceDefinition,
            sourceCardInstance: null,
            arguments: resolvedArguments,
            selectedTargets: selectedTargets ?? []);
    }

    private sealed class StubEffectSpecResolver(EffectSpec effectSpec) : IGameRuntimeEffectSpecResolver
    {
        private readonly EffectSpec effectSpec = effectSpec;

        public EffectSpec? Resolve(GameCardEffectContext context, RuntimeEffects runtimeEffect)
        {
            return runtimeEffect == RuntimeEffects.MoveCard ? effectSpec : null;
        }
    }

    private sealed class StubCanExecuteEvaluator : IGameEffectCanExecuteEvaluator
    {
        public CanExecuteResult Evaluate(GameCardEffectContext context, EffectSpec effectSpec, bool includeValidTargets)
        {
            return new CanExecuteResult
            {
                CanExecute = true,
                ValidTargets = []
            };
        }
    }

    private sealed class StubTargetResolver : IGameEffectTargetResolver
    {
        public IReadOnlyList<GameEffectTargetReference> ResolveTargets(GameCardEffectContext context, EffectSpec effectSpec)
        {
            return [];
        }
    }
}
