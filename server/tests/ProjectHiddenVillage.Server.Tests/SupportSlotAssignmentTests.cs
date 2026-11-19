using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// A support row holds at most one card per slot, and a slot index is always one the client can draw (0-4).
///
/// The engine used to derive a support card's slot from the row's <em>length</em>, which is not a slot: after a
/// card was used out of a middle slot the row kept a hole and the length named an occupied slot, so a second
/// support card landed on top of an existing one. The client paints one card per slot, so the stacked pair
/// flashed the card underneath it on every state refresh. These tests pin the allocator and the repair pass.
/// </summary>
[TestClass]
public sealed class SupportSlotAssignmentTests
{
    private readonly GameRuntimeDeckService service = new(new GameEffectHandlingService());

    [TestMethod]
    public void MoveCardToZone_WhenSupportRowHasAHole_UsesTheLeftmostFreeSlotInsteadOfTheRowLength()
    {
        var game = CreateGame();
        var player = game.State.Players.Single();

        // Slot 1 is empty: slots 0 and 2 hold cards, so the row length (2) names slot 2 - an occupied slot.
        player.SupportZone.Add(CreateInstance("support-a", "card-support", "p1", supportSlotIndex: 0));
        player.SupportZone.Add(CreateInstance("support-b", "card-support", "p1", supportSlotIndex: 2));
        var handCard = CreateInstance("hand-1", "card-support", "p1");
        player.Hand.Add(handCard);

        var moved = service.MoveCardToZone(
            game,
            playerId: "p1",
            sourceZone: PlayerZone.Hand,
            destinationZone: PlayerZone.SupportZone,
            cardInstanceId: handCard.InstanceId);

        Assert.AreEqual(1, moved.SupportSlotIndex);
        AssertSlotIndexesAreUnique(player.SupportZone);
        CollectionAssert.AreEquivalent(new[] { 0, 1, 2 }, player.SupportZone.Select(card => card.SupportSlotIndex!.Value).ToArray());
    }

    [TestMethod]
    public void MoveCardToZone_WhenSupportRowIsFull_RefusesTheCard()
    {
        var game = CreateGame();
        var player = game.State.Players.Single();

        for (var slotIndex = 0; slotIndex < 5; slotIndex++)
        {
            player.SupportZone.Add(CreateInstance($"support-{slotIndex}", "card-support", "p1", supportSlotIndex: slotIndex));
        }

        var handCard = CreateInstance("hand-1", "card-support", "p1");
        player.Hand.Add(handCard);

        var ex = Assert.ThrowsException<InvalidOperationException>(() =>
            service.MoveCardToZone(
                game,
                playerId: "p1",
                sourceZone: PlayerZone.Hand,
                destinationZone: PlayerZone.SupportZone,
                cardInstanceId: handCard.InstanceId));

        StringAssert.Contains(ex.Message, "No empty support slot is available for this card.");
        Assert.AreEqual(5, player.SupportZone.Count);
        Assert.AreEqual(1, player.Hand.Count);
        AssertSlotIndexesAreUnique(player.SupportZone);
    }

    [TestMethod]
    public void MoveCardToZone_HealsTwoCardsOnOneSlotBeforePlacingTheNextOne()
    {
        var game = CreateGame();
        var player = game.State.Players.Single();

        // The exact state the old assignment produced: two cards claiming slot 2.
        var firstClaimant = CreateInstance("support-a", "card-support", "p1", supportSlotIndex: 2);
        var secondClaimant = CreateInstance("support-b", "card-support", "p1", supportSlotIndex: 2);
        player.SupportZone.Add(firstClaimant);
        player.SupportZone.Add(secondClaimant);

        var handCard = CreateInstance("hand-1", "card-support", "p1");
        player.Hand.Add(handCard);

        var moved = service.MoveCardToZone(
            game,
            playerId: "p1",
            sourceZone: PlayerZone.Hand,
            destinationZone: PlayerZone.SupportZone,
            cardInstanceId: handCard.InstanceId);

        AssertSlotIndexesAreUnique(player.SupportZone);
        Assert.AreEqual(2, firstClaimant.SupportSlotIndex);
        Assert.AreEqual(0, secondClaimant.SupportSlotIndex);
        Assert.AreEqual(1, moved.SupportSlotIndex);
    }

    [TestMethod]
    public void MoveCardToZone_WhenRequestedSupportSlotIsOccupied_Throws()
    {
        var game = CreateGame();
        var player = game.State.Players.Single();

        player.SupportZone.Add(CreateInstance("support-a", "card-support", "p1", supportSlotIndex: 1));
        var handCard = CreateInstance("hand-1", "card-support", "p1");
        player.Hand.Add(handCard);

        var ex = Assert.ThrowsException<InvalidOperationException>(() =>
            service.MoveCardToZone(
                game,
                playerId: "p1",
                sourceZone: PlayerZone.Hand,
                destinationZone: PlayerZone.SupportZone,
                cardInstanceId: handCard.InstanceId,
                destinationIndex: 1));

        StringAssert.Contains(ex.Message, "Support slot 1 is already occupied.");
        Assert.AreEqual(1, player.SupportZone.Count);
    }

    [TestMethod]
    public void MoveCardToZone_WhenRequestedSupportSlotIsOutsideTheRow_Throws()
    {
        var game = CreateGame();
        var player = game.State.Players.Single();

        var handCard = CreateInstance("hand-1", "card-support", "p1");
        player.Hand.Add(handCard);

        var ex = Assert.ThrowsException<InvalidOperationException>(() =>
            service.MoveCardToZone(
                game,
                playerId: "p1",
                sourceZone: PlayerZone.Hand,
                destinationZone: PlayerZone.SupportZone,
                cardInstanceId: handCard.InstanceId,
                destinationIndex: 5));

        StringAssert.Contains(ex.Message, "A valid support slot index is required.");
        Assert.AreEqual(0, player.SupportZone.Count);
    }

    [TestMethod]
    public void MoveCardToZone_KeepsTheSupportRowOrderedBySlotIndex()
    {
        var game = CreateGame();
        var player = game.State.Players.Single();

        player.SupportZone.Add(CreateInstance("support-b", "card-support", "p1", supportSlotIndex: 1));
        player.SupportZone.Add(CreateInstance("support-c", "card-support", "p1", supportSlotIndex: 2));
        var handCard = CreateInstance("hand-1", "card-support", "p1");
        player.Hand.Add(handCard);

        service.MoveCardToZone(
            game,
            playerId: "p1",
            sourceZone: PlayerZone.Hand,
            destinationZone: PlayerZone.SupportZone,
            cardInstanceId: handCard.InstanceId,
            destinationIndex: 0);

        CollectionAssert.AreEqual(
            new[] { "hand-1", "support-b", "support-c" },
            player.SupportZone.Select(card => card.InstanceId).ToArray());
    }

    [TestMethod]
    public void ToGameStateResponse_RepairsTwoCardsOnOneSupportSlotBeforePublishing()
    {
        var state = CreateState();
        state.Players[1].SupportZone.Add(CreateInstance("support-a", "card-support", "p2", supportSlotIndex: 2));
        state.Players[1].SupportZone.Add(CreateInstance("support-b", "card-support", "p2", supportSlotIndex: 2));

        var firstResponse = GameStateResponseMapper.ToGameStateResponse(state, "p1");
        var publishedSlots = firstResponse.Players
            .Single(player => player.PlayerId == "p2")
            .SupportZone
            .Select(card => card.SupportSlotIndex!.Value)
            .ToList();

        Assert.AreEqual(2, publishedSlots.Count);
        CollectionAssert.AllItemsAreUnique(publishedSlots);
        Assert.IsTrue(publishedSlots.All(slotIndex => slotIndex is >= 0 and < 5));

        // The repair is deterministic: a second publish of the same state cannot flip the survivor again.
        var secondResponse = GameStateResponseMapper.ToGameStateResponse(state, "p1");
        var republishedSlots = secondResponse.Players
            .Single(player => player.PlayerId == "p2")
            .SupportZone
            .Select(card => card.SupportSlotIndex!.Value)
            .ToList();

        CollectionAssert.AreEqual(publishedSlots, republishedSlots);
    }

    private static void AssertSlotIndexesAreUnique(IReadOnlyList<CardInstance> supportZone)
    {
        var slotIndexes = supportZone.Select(card => card.SupportSlotIndex).ToList();
        CollectionAssert.AllItemsAreUnique(slotIndexes);
        Assert.IsTrue(slotIndexes.All(slotIndex => slotIndex is >= 0 and < 5));
    }

    private static GameInstance CreateGame()
    {
        var state = new GameState
        {
            GameId = "game-1",
            Players =
            [
                new PlayerState { PlayerId = "p1" }
            ],
            CardDefinitions = new Dictionary<string, Card>(StringComparer.Ordinal)
            {
                ["card-support"] = new Card { Id = "card-support", DisplayName = "Support", Name = ["Support"] }
            }
        };

        return new GameInstance(state);
    }

    private static GameState CreateState()
    {
        return new GameState
        {
            GameId = "game-1",
            Phase = GamePhase.MainPhase,
            TurnNumber = 3,
            ActivePlayerId = "p1",
            PriorityPlayerId = "p1",
            CardDefinitions = new Dictionary<string, Card>(StringComparer.Ordinal)
            {
                ["leader-def"] = new LeaderCard
                {
                    Id = "leader-def",
                    DisplayName = "Leader",
                    Name = ["Leader"],
                    Traits = ["Leader"],
                    Type = CardType.Leader,
                    Color = CardColor.Blue,
                    Life = 5,
                    RecoveryEffect = "Recover 1"
                },
                ["card-support"] = new CharacterCard
                {
                    Id = "card-support",
                    DisplayName = "Support",
                    Name = ["Support"],
                    Type = CardType.Character,
                    Color = CardColor.Red,
                    Traits = [],
                    Description = string.Empty,
                    Damage = 0,
                    Power = 1,
                    Health = 3,
                    Effects = []
                }
            },
            Players =
            [
                new PlayerState
                {
                    PlayerId = "p1",
                    LeaderCardInstance = CreateLeader("p1")
                },
                new PlayerState
                {
                    PlayerId = "p2",
                    LeaderCardInstance = CreateLeader("p2")
                }
            ]
        };
    }

    private static LeaderCardInstanceState CreateLeader(string playerId)
    {
        return new LeaderCardInstanceState
        {
            InstanceId = $"leader-{playerId}",
            CardDefinitionId = "leader-def",
            OwnerPlayerId = playerId,
            ControllerPlayerId = playerId,
            Name = "Leader",
            Color = CardColor.Blue,
            Traits = ["Leader"],
            Damage = 0,
            Power = 0,
            TotalLife = 5,
            CurrentLife = 5,
            RecoveryEffect = "Recover 1"
        };
    }

    private static CardInstance CreateInstance(
        string instanceId,
        string definitionId,
        string playerId,
        int? supportSlotIndex = null)
    {
        return new CardInstance
        {
            InstanceId = instanceId,
            CardDefinitionId = definitionId,
            OwnerPlayerId = playerId,
            ControllerPlayerId = playerId,
            SupportSlotIndex = supportSlotIndex
        };
    }
}
