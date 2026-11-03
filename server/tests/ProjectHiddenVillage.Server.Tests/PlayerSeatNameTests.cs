using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// The board labels each side with the name that seat sat down with, next to that side's presence dot. The name is
/// copied onto the seat when it is built, so every state read publishes it without a second lookup.
/// </summary>
[TestClass]
public sealed class PlayerSeatNameTests
{
    [TestMethod]
    public void EachSeat_KeepsTheNameItSatDownWith()
    {
        var game = new GameInstanceFactory().Create(
            [
                new Player { Id = "p1", Name = "alice", Deck = ["card-1"] },
                new Player { Id = "p2", Name = "bob", DisplayName = "Bob the Bold", Deck = ["card-1"] },
            ],
            GameCodeLifecycleTests.BuildDefinitions());

        Assert.AreEqual("alice", game.State.Players.Single(player => player.PlayerId == "p1").PlayerName);
        Assert.AreEqual(
            "Bob the Bold",
            game.State.Players.Single(player => player.PlayerId == "p2").PlayerName,
            "The display name wins over the plain one when the seat carries both.");
    }

    [TestMethod]
    public void ASeatComposedWithoutAName_KeepsAnEmptyOne()
    {
        var game = new GameInstanceFactory().Create(
            [
                new Player { Id = "p1", Name = "alice", Deck = ["card-1"] },
                new Player { Id = "p2", Deck = ["card-1"] },
            ],
            GameCodeLifecycleTests.BuildDefinitions());

        Assert.AreEqual(
            string.Empty,
            game.State.Players.Single(player => player.PlayerId == "p2").PlayerName,
            "The board draws the dot alone rather than inventing a label.");
    }
}
