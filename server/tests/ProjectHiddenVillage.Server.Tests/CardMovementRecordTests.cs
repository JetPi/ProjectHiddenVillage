using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// The recorded card movements are what the clients animate instead of inferring a move from zone/count deltas
/// (see <see cref="AnimationEventResponse"/>), so their identity and bounding matter: a duplicate id would make a
/// client skip a move, and an unbounded tail would grow every response.
/// </summary>
[TestClass]
public sealed class CardMovementRecordTests
{
    [TestMethod]
    public void RecordCardMovement_AssignsStableOrderedIdsAndZones()
    {
        var state = new GameState();

        state.RecordCardMovement(CardMovementKinds.Draw, "card-a", "p1", CardMovementZones.Deck, CardMovementZones.Hand);
        state.RecordCardMovement(CardMovementKinds.Draw, "card-b", "p1", CardMovementZones.Deck, CardMovementZones.Hand);

        Assert.AreEqual(2, state.RecordedCardMovements.Count);
        Assert.AreEqual("movement:1", state.RecordedCardMovements[0].EventId);
        Assert.AreEqual("movement:2", state.RecordedCardMovements[1].EventId);
        Assert.AreEqual("card-a", state.RecordedCardMovements[0].CardInstanceId);
        Assert.AreEqual("p1", state.RecordedCardMovements[0].PlayerId);
        Assert.AreEqual(CardMovementZones.Deck, state.RecordedCardMovements[0].FromZone);
        Assert.AreEqual(CardMovementZones.Hand, state.RecordedCardMovements[0].ToZone);
    }

    [TestMethod]
    public void RecordCardMovement_IgnoresBlankKindOrCard()
    {
        var state = new GameState();

        state.RecordCardMovement(CardMovementKinds.Draw, "   ", "p1", fromZone: null, toZone: CardMovementZones.Hand);
        state.RecordCardMovement("   ", "card-a", "p1", fromZone: null, toZone: CardMovementZones.Hand);

        Assert.AreEqual(0, state.RecordedCardMovements.Count);
    }

    [TestMethod]
    public void RecordCardMovement_KeepsTheNewestMovementsAndMonotonicIds()
    {
        var state = new GameState();

        for (var index = 0; index < GameState.MaxRecordedCardMovements + 3; index++)
        {
            state.RecordCardMovement(
                CardMovementKinds.Draw,
                $"card-{index}",
                "p1",
                CardMovementZones.Deck,
                CardMovementZones.Hand);
        }

        Assert.AreEqual(GameState.MaxRecordedCardMovements, state.RecordedCardMovements.Count);
        // The oldest three were dropped, and the remaining ids stay monotonic so a client can still de-duplicate.
        Assert.AreEqual("card-3", state.RecordedCardMovements[0].CardInstanceId);
        Assert.AreEqual(
            $"movement:{GameState.MaxRecordedCardMovements + 3}",
            state.RecordedCardMovements[^1].EventId);
    }
}
