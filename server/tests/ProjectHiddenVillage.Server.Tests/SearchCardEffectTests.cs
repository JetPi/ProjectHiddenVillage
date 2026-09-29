using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class SearchCardEffectTests
{
    [TestMethod]
    public void Execute_MovesTheSearchedCardToHand_AndRevealsItWhileItLeavesTheDeck()
    {
        var effectSpec = CreateSearchCardEffectSpec();
        var context = CreateContext();

        var result = CreateEffect(effectSpec).Execute(
            context,
            [new GameEffectTargetReference("p1", PlayerZone.Deck, "deck-1")]);

        Assert.IsFalse(result.IsError);

        var player = context.Game.State.Players.First(entry => entry.PlayerId == "p1");
        Assert.AreEqual(2, player.Hand.Count);
        Assert.IsTrue(player.Hand.Any(card => card.InstanceId == "deck-1"));
        Assert.AreEqual(1, player.Deck.Count);
        Assert.IsFalse(player.Deck.Any(card => card.InstanceId == "deck-1"));

        // Reveal "while it leaves the deck": MoveCardToZone clears the reveal as soon as the card lands outside
        // the zone it was revealed in, so the opponent sees the card leave the deck and it is concealed again
        // once it sits in the hand.
        var searchedCard = player.Hand.First(card => card.InstanceId == "deck-1");
        Assert.IsFalse(searchedCard.IsRevealedToBothPlayers);
        Assert.IsNull(searchedCard.RevealedInZone);
    }

    [TestMethod]
    public void Execute_KeepsTheDeckOrder_WhenShuffleAfterIsDisabled()
    {
        var effectSpec = CreateSearchCardEffectSpec(shuffleAfter: false);
        var context = CreateContext();

        var result = CreateEffect(effectSpec).Execute(
            context,
            [new GameEffectTargetReference("p1", PlayerZone.Deck, "deck-1")]);

        Assert.IsFalse(result.IsError);

        var player = context.Game.State.Players.First(entry => entry.PlayerId == "p1");
        Assert.AreEqual("deck-2", player.Deck[0].InstanceId);
    }

    [TestMethod]
    public void Execute_Fails_WhenTheMoveActionDoesNotSearchTheDeck()
    {
        var effectSpec = CreateSearchCardEffectSpec(sourceZone: PlayerZone.Hand);
        var context = CreateContext();

        var result = CreateEffect(effectSpec).Execute(
            context,
            [new GameEffectTargetReference("p1", PlayerZone.Hand, "hand-1")]);

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Game.Effect.SearchCard.InvalidSourceZone", result.FirstError.Code);
    }

    [TestMethod]
    public void Execute_Fails_WhenTheSelectedCardIsNoLongerInTheDeck()
    {
        var effectSpec = CreateSearchCardEffectSpec();
        var context = CreateContext();

        var result = CreateEffect(effectSpec).Execute(
            context,
            [new GameEffectTargetReference("p1", PlayerZone.Deck, "missing-card")]);

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Game.Effect.SearchCard.NoCardsMoved", result.FirstError.Code);
    }

    private static SearchCardEffect CreateEffect(EffectSpec effectSpec)
    {
        return new SearchCardEffect(
            effectSpecResolver: new StubEffectSpecResolver(effectSpec),
            canExecuteEvaluator: new StubCanExecuteEvaluator(),
            targetResolver: new StubTargetResolver(),
            runtimeDeckService: new GameRuntimeDeckService(new GameEffectHandlingService()));
    }

    private static EffectSpec CreateSearchCardEffectSpec(
        PlayerZone sourceZone = PlayerZone.Deck,
        bool revealSelection = true,
        bool shuffleAfter = true)
    {
        return new EffectSpec
        {
            Id = "search",
            RuntimeEffectType = RuntimeEffects.SearchCard,
            EffectType = EffectKind.Activated,
            Timing = EffectTiming.ActivateMain,
            TargetRange = EffectTargetRange.Self,
            SearchRevealSelection = revealSelection,
            SearchShuffleAfter = shuffleAfter,
            ContextRules = [],
            MoveCardActions =
            [
                new MoveCardActionSpec
                {
                    Operation = MoveCardOperationType.Move,
                    SourceZone = sourceZone,
                    DestinationZone = PlayerZone.Hand,
                    MoveCount = 1,
                    DestinationPlayerRange = EffectTargetRange.Self,
                },
            ],
        };
    }

    private static GameCardEffectContext CreateContext()
    {
        var state = new GameState
        {
            GameId = "search-game-1",
            ActivePlayerId = "p1",
            PriorityPlayerId = "p1",
            TurnNumber = 1,
            CardDefinitions =
            {
                ["card-1"] = CreateCard("card-1", "Card 1"),
                ["card-2"] = CreateCard("card-2", "Card 2"),
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
                        },
                    ],
                },
                new PlayerState { PlayerId = "p2" },
            ],
        };

        return new GameCardEffectContext(
            game: new GameInstance(state),
            actingPlayer: new Player { Id = "p1" },
            sourceCardDefinition: CreateCard("source", "Source"),
            sourceCardInstance: null,
            arguments: new Dictionary<string, string>(StringComparer.Ordinal),
            selectedTargets: []);
    }

    private static Card CreateCard(string id, string displayName)
    {
        return new Card
        {
            Id = id,
            DisplayName = displayName,
            Name = [displayName],
            Type = CardType.Character,
            Color = CardColor.Red,
            Traits = [],
            Damage = 1,
            Power = 1,
        };
    }

    private sealed class StubEffectSpecResolver(EffectSpec effectSpec) : IGameRuntimeEffectSpecResolver
    {
        public EffectSpec? Resolve(GameCardEffectContext context, RuntimeEffects runtimeEffect)
        {
            return runtimeEffect == RuntimeEffects.SearchCard ? effectSpec : null;
        }
    }

    private sealed class StubCanExecuteEvaluator : IGameEffectCanExecuteEvaluator
    {
        public CanExecuteResult Evaluate(GameCardEffectContext context, EffectSpec effectSpec, bool includeValidTargets)
        {
            return new CanExecuteResult { CanExecute = true, ValidTargets = [] };
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
