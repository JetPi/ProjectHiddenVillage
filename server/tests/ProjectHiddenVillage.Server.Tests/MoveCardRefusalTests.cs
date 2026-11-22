using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// A move that names an impossible destination index is refused before the card leaves its source zone.
///
/// `MoveCardToZone` used to remove the card first and validate the destination afterwards: the throw landed
/// between the removal and the insert, so the instance existed in no zone at all. The caller reported an error,
/// the hub still published the mutated state (a failed operation may have partially mutated the game), and both
/// players lost the card for good - it survived a refresh because it was gone from the engine, not from a view.
/// These tests pin the ordering for every destination zone, plus the boundary the old post-removal check allowed.
/// </summary>
[TestClass]
public sealed class MoveCardRefusalTests
{
    private readonly GameRuntimeDeckService service = new(new GameEffectHandlingService());

    [DataTestMethod]
    [DataRow(PlayerZone.Hand)]
    [DataRow(PlayerZone.Deck)]
    [DataRow(PlayerZone.Trash)]
    [DataRow(PlayerZone.ExileZone)]
    [DataRow(PlayerZone.CharacterField)]
    public void MoveCardToZone_WhenDestinationIndexIsOutOfRange_LeavesTheSourceZoneUntouched(PlayerZone destinationZone)
    {
        var game = CreateGame();
        var player = game.State.Players.Single();
        var sourceCard = CreateInstance("hand-1", "card-1", "p1");
        player.Hand.Add(sourceCard);

        var destinationCountBefore = ResolveZone(player, destinationZone).Count;

        var ex = Assert.ThrowsException<ArgumentOutOfRangeException>(() =>
            service.MoveCardToZone(
                game,
                playerId: "p1",
                sourceZone: PlayerZone.Hand,
                destinationZone: destinationZone,
                cardInstanceId: sourceCard.InstanceId,
                destinationIndex: destinationCountBefore + 1));

        StringAssert.Contains(ex.Message, "Destination index must be between");
        Assert.AreEqual(1, player.Hand.Count);
        Assert.AreSame(sourceCard, player.Hand[0]);
        Assert.AreEqual(destinationCountBefore, ResolveZone(player, destinationZone).Count);
        AssertCardExistsExactlyOnce(player, sourceCard);
    }

    [TestMethod]
    public void MoveCardToZone_WhenTrashRecallNamesAnImpossibleIndex_DoesNotConsumeTheTrashCard()
    {
        var game = CreateGame();
        var player = game.State.Players.Single();
        var trashCard = CreateInstance("trash-1", "card-1", "p1");
        player.DiscardPile.Add(trashCard);

        // The reported symptom: a card leaving the trash for an impossible position vanished from the table.
        var ex = Assert.ThrowsException<ArgumentOutOfRangeException>(() =>
            service.MoveCardToZone(
                game,
                playerId: "p1",
                sourceZone: PlayerZone.Trash,
                destinationZone: PlayerZone.Hand,
                cardInstanceId: trashCard.InstanceId,
                destinationIndex: 3));

        StringAssert.Contains(ex.Message, "Destination index must be between");
        Assert.AreEqual(1, player.DiscardPile.Count);
        Assert.AreSame(trashCard, player.DiscardPile[0]);
        Assert.AreEqual(0, player.Hand.Count);
        AssertCardExistsExactlyOnce(player, trashCard);
    }

    [TestMethod]
    public void MoveCardToZone_WhenDestinationIndexIsTheEndOfAnotherZone_IsAccepted()
    {
        var game = CreateGame();
        var player = game.State.Players.Single();
        var movedCard = CreateInstance("deck-1", "card-1", "p1");
        var firstHandCard = CreateInstance("hand-1", "card-2", "p1");
        var secondHandCard = CreateInstance("hand-2", "card-2", "p1");
        player.Deck.Add(movedCard);
        player.Hand.Add(firstHandCard);
        player.Hand.Add(secondHandCard);

        service.MoveCardToZone(
            game,
            playerId: "p1",
            sourceZone: PlayerZone.Deck,
            destinationZone: PlayerZone.Hand,
            cardInstanceId: movedCard.InstanceId,
            destinationIndex: 2);

        Assert.AreEqual(0, player.Deck.Count);
        CollectionAssert.AreEqual(
            new[] { firstHandCard.InstanceId, secondHandCard.InstanceId, movedCard.InstanceId },
            player.Hand.Select(card => card.InstanceId).ToArray());
    }

    [TestMethod]
    public void MoveCardToZone_WhenSameZoneIndexIsTheOldEnd_IsAccepted()
    {
        var game = CreateGame();
        var player = game.State.Players.Single();
        var reorderedCard = CreateInstance("hand-1", "card-1", "p1");
        var firstHandCard = CreateInstance("hand-2", "card-2", "p1");
        var secondHandCard = CreateInstance("hand-3", "card-2", "p1");
        player.Hand.Add(reorderedCard);
        player.Hand.Add(firstHandCard);
        player.Hand.Add(secondHandCard);

        // Count is 3 and the requested index is 3: the old check accepted it after the removal shifted it to 2,
        // and the pre-removal check must keep accepting it.
        service.MoveCardToZone(
            game,
            playerId: "p1",
            sourceZone: PlayerZone.Hand,
            destinationZone: PlayerZone.Hand,
            cardInstanceId: reorderedCard.InstanceId,
            destinationIndex: 3);

        Assert.AreEqual(3, player.Hand.Count);
        CollectionAssert.AreEqual(
            new[] { firstHandCard.InstanceId, secondHandCard.InstanceId, reorderedCard.InstanceId },
            player.Hand.Select(card => card.InstanceId).ToArray());
    }

    [TestMethod]
    public void MoveCardToZone_WhenSameZoneIndexIsPastTheOldEnd_IsRefused()
    {
        var game = CreateGame();
        var player = game.State.Players.Single();
        var reorderedCard = CreateInstance("hand-1", "card-1", "p1");
        player.Hand.Add(reorderedCard);
        player.Hand.Add(CreateInstance("hand-2", "card-2", "p1"));
        player.Hand.Add(CreateInstance("hand-3", "card-2", "p1"));

        Assert.ThrowsException<ArgumentOutOfRangeException>(() =>
            service.MoveCardToZone(
                game,
                playerId: "p1",
                sourceZone: PlayerZone.Hand,
                destinationZone: PlayerZone.Hand,
                cardInstanceId: reorderedCard.InstanceId,
                destinationIndex: 4));

        Assert.AreEqual(3, player.Hand.Count);
        Assert.AreSame(reorderedCard, player.Hand[0]);
        AssertCardExistsExactlyOnce(player, reorderedCard);
    }

    private static List<CardInstance> ResolveZone(PlayerState player, PlayerZone zone)
    {
        return zone switch
        {
            PlayerZone.Hand => player.Hand,
            PlayerZone.Deck => player.Deck,
            PlayerZone.Trash => player.DiscardPile,
            PlayerZone.ExileZone => player.ExileZone,
            PlayerZone.CharacterField => player.Battlefield,
            PlayerZone.SupportZone => player.SupportZone,
            _ => throw new ArgumentOutOfRangeException(nameof(zone), zone, "Unsupported zone.")
        };
    }

    /// <summary>
    /// The point of these tests: after a refused move the instance still exists, exactly once, somewhere.
    /// </summary>
    private static void AssertCardExistsExactlyOnce(PlayerState player, CardInstance card)
    {
        var occurrences = player.Deck
            .Concat(player.Hand)
            .Concat(player.Battlefield)
            .Concat(player.DiscardPile)
            .Concat(player.SupportZone)
            .Concat(player.ExileZone)
            .Count(candidate => ReferenceEquals(candidate, card));

        Assert.AreEqual(1, occurrences, $"Card '{card.InstanceId}' must exist in exactly one zone after a refused move.");
    }

    private static GameInstance CreateGame()
    {
        var state = new GameState
        {
            GameId = "game-refusal",
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
