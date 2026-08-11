using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class GameRuntimeDeckServiceTests
{
    private readonly GameRuntimeDeckService service = new(new GameEffectHandlingService());

    [TestMethod]
    public void MoveCardToZone_MovesCardFromHandToTrash()
    {
        var game = CreateGame();
        var player = game.State.Players.Single();
        var handCard = CreateInstance("hand-1", "card-1", "p1");

        player.Hand.Add(handCard);

        var moved = service.MoveCardToZone(
            game,
            playerId: "p1",
            sourceZone: PlayerZone.Hand,
            destinationZone: PlayerZone.Trash,
            cardInstanceId: handCard.InstanceId);

        Assert.AreEqual(handCard.InstanceId, moved.InstanceId);
        Assert.AreEqual(0, player.Hand.Count);
        Assert.AreEqual(1, player.DiscardPile.Count);
        Assert.AreEqual(handCard.InstanceId, player.DiscardPile[0].InstanceId);
    }

    [TestMethod]
    public void MoveCardToZone_InsertsAtRequestedIndex()
    {
        var game = CreateGame();
        var player = game.State.Players.Single();

        var movedCard = CreateInstance("deck-1", "card-1", "p1");
        var existingHandCard = CreateInstance("hand-1", "card-2", "p1");

        player.Deck.Add(movedCard);
        player.Hand.Add(existingHandCard);

        service.MoveCardToZone(
            game,
            playerId: "p1",
            sourceZone: PlayerZone.Deck,
            destinationZone: PlayerZone.Hand,
            cardInstanceId: movedCard.InstanceId,
            destinationIndex: 0);

        Assert.AreEqual(0, player.Deck.Count);
        Assert.AreEqual(2, player.Hand.Count);
        Assert.AreEqual(movedCard.InstanceId, player.Hand[0].InstanceId);
        Assert.AreEqual(existingHandCard.InstanceId, player.Hand[1].InstanceId);
    }

    [TestMethod]
    public void MoveCardToZone_WithoutDestinationIndex_InsertsAtTopOfDestinationZone()
    {
        var game = CreateGame();
        var player = game.State.Players.Single();

        var movedCard = CreateInstance("deck-top-default", "card-1", "p1");
        var existingHandCard = CreateInstance("existing-hand", "card-2", "p1");

        player.Deck.Add(movedCard);
        player.Hand.Add(existingHandCard);

        service.MoveCardToZone(
            game,
            playerId: "p1",
            sourceZone: PlayerZone.Deck,
            destinationZone: PlayerZone.Hand,
            cardInstanceId: movedCard.InstanceId);

        Assert.AreEqual(0, player.Deck.Count);
        Assert.AreEqual(2, player.Hand.Count);
        Assert.AreEqual(movedCard.InstanceId, player.Hand[0].InstanceId);
        Assert.AreEqual(existingHandCard.InstanceId, player.Hand[1].InstanceId);
    }

    [TestMethod]
    public void DrawCardFromDeck_MovesTopCardToHand()
    {
        var game = CreateGame();
        var player = game.State.Players.Single();

        var top = CreateInstance("top", "card-1", "p1");
        var second = CreateInstance("second", "card-2", "p1");

        player.Deck.Add(top);
        player.Deck.Add(second);

        var drawn = service.DrawCardFromDeck(game, "p1");

        Assert.IsNotNull(drawn);
        Assert.AreEqual("top", drawn.InstanceId);
        Assert.AreEqual(1, player.Deck.Count);
        Assert.AreEqual("second", player.Deck[0].InstanceId);
        Assert.AreEqual(1, player.Hand.Count);
        Assert.AreEqual("top", player.Hand[0].InstanceId);
    }

    [TestMethod]
    public void DrawCardFromDeck_WhenDeckEmpty_ReturnsNull()
    {
        var game = CreateGame();

        var drawn = service.DrawCardFromDeck(game, "p1");

        Assert.IsNull(drawn);
    }

    [TestMethod]
    public void MoveCardToZone_WhenCrossPlayerAndNotAllowed_Throws()
    {
        var game = CreateTwoPlayerGame();
        var sourcePlayer = game.State.Players.Single(player => player.PlayerId == "p1");

        var handCard = CreateInstance("cross-1", "card-1", "p1");
        sourcePlayer.Hand.Add(handCard);

        var ex = Assert.ThrowsException<InvalidOperationException>(() =>
            service.MoveCardToZone(
                game,
                playerId: "p1",
                sourceZone: PlayerZone.Hand,
                destinationZone: PlayerZone.Trash,
                cardInstanceId: handCard.InstanceId,
                destinationPlayerId: "p2"));

        StringAssert.Contains(ex.Message, "Cross-player zone moves require");
    }

    [TestMethod]
    public void MoveCardToZone_WhenCrossPlayerAllowed_MovesToOtherPlayerZone()
    {
        var game = CreateTwoPlayerGame();
        var sourcePlayer = game.State.Players.Single(player => player.PlayerId == "p1");
        var destinationPlayer = game.State.Players.Single(player => player.PlayerId == "p2");

        var handCard = CreateInstance("cross-2", "card-1", "p1");
        sourcePlayer.Hand.Add(handCard);

        var moved = service.MoveCardToZone(
            game,
            playerId: "p1",
            sourceZone: PlayerZone.Hand,
            destinationZone: PlayerZone.Trash,
            cardInstanceId: handCard.InstanceId,
            destinationPlayerId: "p2",
            allowCrossPlayer: true);

        Assert.AreEqual(0, sourcePlayer.Hand.Count);
        Assert.AreEqual(1, destinationPlayer.DiscardPile.Count);
        Assert.AreEqual(handCard.InstanceId, destinationPlayer.DiscardPile[0].InstanceId);
        Assert.AreEqual("p1", moved.OwnerPlayerId);
        Assert.AreEqual("p2", moved.ControllerPlayerId);
    }

    private static GameInstance CreateGame()
    {
        var state = new GameState
        {
            GameId = "game-1",
            Players =
            [
                new PlayerState
                {
                    PlayerId = "p1"
                }
            ],
            CardDefinitions = new Dictionary<string, Card>(StringComparer.Ordinal)
            {
                ["card-1"] = new Card { Id = "card-1", DisplayName = "Card 1", Name = ["Card 1"] },
                ["card-2"] = new Card { Id = "card-2", DisplayName = "Card 2", Name = ["Card 2"] }
            }
        };

        return new GameInstance(state);
    }

    private static GameInstance CreateTwoPlayerGame()
    {
        var state = new GameState
        {
            GameId = "game-2",
            Players =
            [
                new PlayerState { PlayerId = "p1" },
                new PlayerState { PlayerId = "p2" }
            ],
            CardDefinitions = new Dictionary<string, Card>(StringComparer.Ordinal)
            {
                ["card-1"] = new Card { Id = "card-1", DisplayName = "Card 1", Name = ["Card 1"] },
                ["card-2"] = new Card { Id = "card-2", DisplayName = "Card 2", Name = ["Card 2"] }
            }
        };

        return new GameInstance(state);
    }

    private static CardInstance CreateInstance(string instanceId, string definitionId, string playerId)
    {
        return new CardInstance
        {
            InstanceId = instanceId,
            CardDefinitionId = definitionId,
            OwnerPlayerId = playerId,
            ControllerPlayerId = playerId,
            IsExhausted = false
        };
    }
}
