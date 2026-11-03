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

    [TestMethod]
    public void GetPresenceDeadline_IsSilentWhileThePlayerIsWatching()
    {
        var time = new GameCodeLifecycleTests.MutableTimeProvider(DateTimeOffset.UnixEpoch);
        var timedTracker = new GamePresenceTracker(time);

        timedTracker.RegisterConnection("game-1", "player-a", "connection-1");

        Assert.IsNull(
            timedTracker.GetPresenceDeadline("game-1", "player-a", TimeSpan.FromSeconds(5)),
            "A connected player has no departure to count from.");
    }

    [TestMethod]
    public void GetPresenceDeadline_StartsAtTheDepartureOfTheLastConnection()
    {
        var time = new GameCodeLifecycleTests.MutableTimeProvider(DateTimeOffset.UnixEpoch);
        var timedTracker = new GamePresenceTracker(time);

        timedTracker.RegisterConnection("game-1", "player-a", "connection-1");
        timedTracker.RegisterConnection("game-1", "player-a", "connection-2");

        time.Advance(TimeSpan.FromSeconds(10));
        timedTracker.RemoveConnection("connection-1");

        Assert.IsNull(
            timedTracker.GetPresenceDeadline("game-1", "player-a", TimeSpan.FromSeconds(5)),
            "A second tab is still watching, so nothing has departed yet.");

        time.Advance(TimeSpan.FromSeconds(10));
        timedTracker.RemoveConnection("connection-2");

        Assert.AreEqual(
            DateTimeOffset.UnixEpoch.AddSeconds(25),
            timedTracker.GetPresenceDeadline("game-1", "player-a", TimeSpan.FromSeconds(5)));
    }

    [TestMethod]
    public void GetPresenceDeadline_ForgetsTheDepartureWhenThePlayerIsBack()
    {
        var time = new GameCodeLifecycleTests.MutableTimeProvider(DateTimeOffset.UnixEpoch);
        var timedTracker = new GamePresenceTracker(time);

        timedTracker.RegisterConnection("game-1", "player-a", "connection-1");
        timedTracker.RemoveConnection("connection-1");

        Assert.IsNotNull(timedTracker.GetPresenceDeadline("game-1", "player-a", TimeSpan.FromSeconds(5)));

        timedTracker.RegisterConnection("game-1", "player-a", "connection-2");

        Assert.IsNull(
            timedTracker.GetPresenceDeadline("game-1", "player-a", TimeSpan.FromSeconds(5)),
            "Watching again is proof the player never really left.");
    }

    [TestMethod]
    public void GetPresenceDeadline_AnswersNothingForAPlayerItNeverSaw()
    {
        Assert.IsNull(
            tracker.GetPresenceDeadline("game-1", "player-a", TimeSpan.FromSeconds(5)),
            "An unobserved seat is not an empty one: the board must not gray out over it.");
        Assert.IsNull(tracker.GetPresenceDeadline("   ", "player-a", TimeSpan.FromSeconds(5)));
        Assert.IsNull(tracker.GetPresenceDeadline("game-1", "   ", TimeSpan.FromSeconds(5)));
    }
}
