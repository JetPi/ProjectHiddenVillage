using ProjectHiddenVillage.Server.Api.Services.Games;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class GamePresenceTrackerTests
{
    private readonly GamePresenceTracker tracker = new();

    [TestMethod]
    public void GetConnectedPlayerIds_CountsAPlayerOnceAcrossSeveralConnections()
    {
        tracker.RegisterConnection("GAME-1", "player-a", "connection-1");
        tracker.RegisterConnection("GAME-1", "player-a", "connection-2");
        tracker.RegisterConnection("GAME-1", "player-b", "connection-3");

        CollectionAssert.AreEquivalent(
            new[] { "playera", "playerb" },
            tracker.GetConnectedPlayerIds("Game-1").ToArray());
    }

    [TestMethod]
    public void RemoveConnection_KeepsThePlayerWhileAnotherConnectionRemains()
    {
        tracker.RegisterConnection("game-1", "player-a", "connection-1");
        tracker.RegisterConnection("game-1", "player-a", "connection-2");

        tracker.RemoveConnection("connection-1");

        Assert.IsTrue(tracker.IsPlayerConnected("game-1", "player-a"));

        tracker.RemoveConnection("connection-2");

        Assert.IsFalse(tracker.IsPlayerConnected("game-1", "player-a"));
        Assert.AreEqual(0, tracker.GetConnectedPlayerIds("game-1").Count);
    }

    [TestMethod]
    public void RemoveConnection_OnlyRemovesTheConnectionThatClosed()
    {
        tracker.RegisterConnection("game-1", "player-a", "connection-1");
        tracker.RegisterConnection("game-1", "player-b", "connection-2");

        tracker.RemoveConnection("connection-2");

        CollectionAssert.AreEqual(
            new[] { "playera" },
            tracker.GetConnectedPlayerIds("game-1").ToArray());
        Assert.IsFalse(tracker.IsPlayerConnected("game-1", "playerb"));
    }

    [TestMethod]
    public void Getters_NormalizePlayerAndGameIds()
    {
        // The hub derives player ids in the dash-free "N" format while the client's auth session carries the
        // dashed form, and game ids are upper-cased when they are mapped: the tracker has to see past both.
        tracker.RegisterConnection("game1", "0000000000000000000000000000000a", "connection-1");

        CollectionAssert.AreEqual(
            new[] { "0000000000000000000000000000000a" },
            tracker.GetConnectedPlayerIds("GAME1").ToArray());
        Assert.IsTrue(tracker.IsPlayerConnected("game1", "00000000-0000-0000-0000-00000000000A"));
    }

    [TestMethod]
    public void Getters_ReportNothingForAnUnknownGameOrPlayer()
    {
        tracker.RegisterConnection("game-1", "player-a", "connection-1");

        Assert.AreEqual(0, tracker.GetConnectedPlayerIds("other-game").Count);
        Assert.AreEqual(0, tracker.GetConnectedPlayerIds(string.Empty).Count);
        Assert.IsFalse(tracker.IsPlayerConnected("game-1", "player-b"));
    }

    [TestMethod]
    public void RegisterConnection_IgnoresIncompleteAddresses()
    {
        tracker.RegisterConnection("game-1", "player-a", "  ");
        tracker.RegisterConnection("game-1", "  ", "connection-1");
        tracker.RegisterConnection("  ", "player-a", "connection-2");

        Assert.AreEqual(0, tracker.GetConnectedPlayerIds("game-1").Count);
    }
}
