using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// The action clock in isolation: who it charges, for how much, and what a stop's budget does to the pool. See
/// <c>plans/game-action-clocks.md</c>. The registry-level behaviour (watchdog, yield moves, forfeit) is covered by
/// <see cref="GameClockRegistryTests"/>.
/// </summary>
[TestClass]
public sealed class GameClockTests
{
    private static readonly DateTimeOffset Start = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    private static GameClockPolicy StandardPolicy => GameClockPolicy.FromSeconds(
        enabled: true,
        mainPhaseSeconds: 60,
        otherPhaseSeconds: 30,
        playerPoolSeconds: 1800,
        timeoutsBeforeForfeit: 3);

    private static GameClock CreateClock(GameClockPolicy? policy = null)
    {
        var clock = new GameClock(policy ?? StandardPolicy);
        clock.Start(["p1", "p2"]);
        return clock;
    }

    [TestMethod]
    public void SyncTo_ArmsTheMainPhaseBudget_ForTheActivePlayersMainPhase()
    {
        var clock = CreateClock();

        var result = clock.SyncTo(new GameClockStop("p1", GameClockStopKind.MainPhase), Start);

        Assert.IsTrue(result.Rearmed);
        Assert.AreEqual("p1", clock.OwningPlayerId);
        Assert.AreEqual(GameClockStopKind.MainPhase, clock.StopKind);
        Assert.AreEqual(Start.AddSeconds(60), clock.DeadlineUtc);
        Assert.AreEqual(TimeSpan.FromSeconds(60), clock.RemainingInStop(Start));
        Assert.IsTrue(clock.IsRunning);
    }

    [TestMethod]
    public void SyncTo_ArmsTheShorterBudget_ForAnyOtherStop()
    {
        var clock = CreateClock();

        clock.SyncTo(new GameClockStop("p2", GameClockStopKind.OtherStep), Start);

        Assert.AreEqual(Start.AddSeconds(30), clock.DeadlineUtc);
        Assert.AreEqual(GameClockStopKind.OtherStep, clock.StopKind);
    }

    [TestMethod]
    public void SyncTo_StopsTheClock_WhenNobodyIsOwed()
    {
        var clock = CreateClock();
        clock.SyncTo(new GameClockStop("p1", GameClockStopKind.MainPhase), Start);

        clock.SyncTo(GameClockStop.None, Start.AddSeconds(5));

        Assert.IsNull(clock.OwningPlayerId);
        Assert.IsNull(clock.DeadlineUtc);
        Assert.AreEqual(GameClockStopKind.None, clock.StopKind);
        Assert.IsFalse(clock.IsRunning);
    }

    [TestMethod]
    public void SyncTo_DoesNotMoveTheDeadline_WhenTheOwnerDidNotAct()
    {
        var clock = CreateClock();
        clock.SyncTo(new GameClockStop("p1", GameClockStopKind.MainPhase), Start);

        var result = clock.SyncTo(new GameClockStop("p1", GameClockStopKind.MainPhase), Start.AddSeconds(5));

        Assert.IsFalse(result.Rearmed);
        Assert.AreEqual(Start.AddSeconds(60), clock.DeadlineUtc);
    }

    [TestMethod]
    public void SyncTo_RefreshesTheFullBudget_WhenTheOwnerActs()
    {
        var clock = CreateClock();
        clock.SyncTo(new GameClockStop("p1", GameClockStopKind.MainPhase), Start);

        var result = clock.SyncTo(
            new GameClockStop("p1", GameClockStopKind.MainPhase),
            Start.AddSeconds(40),
            actingPlayerId: "p1");

        Assert.IsTrue(result.Rearmed);
        Assert.AreEqual(Start.AddSeconds(100), clock.DeadlineUtc);
        // The time the player used is spent, even though the stop was refreshed.
        Assert.AreEqual(TimeSpan.FromSeconds(1760), clock.RemainingPool("p1"));
    }

    [TestMethod]
    public void SyncTo_ClearsTheOwnersStrikes_WhenTheyAct()
    {
        var clock = CreateClock();
        clock.SyncTo(new GameClockStop("p1", GameClockStopKind.MainPhase), Start);

        clock.RegisterTimeout(Start.AddSeconds(60));
        Assert.AreEqual(1, clock.ConsecutiveTimeouts("p1"));

        clock.SyncTo(
            new GameClockStop("p1", GameClockStopKind.MainPhase),
            Start.AddSeconds(70),
            actingPlayerId: "p1");

        Assert.AreEqual(0, clock.ConsecutiveTimeouts("p1"));
    }

    [TestMethod]
    public void SyncTo_LeavesTheOtherPlayersStrikesAlone()
    {
        var clock = CreateClock();
        clock.SyncTo(new GameClockStop("p2", GameClockStopKind.MainPhase), Start);
        clock.RegisterTimeout(Start.AddSeconds(60));

        clock.SyncTo(new GameClockStop("p1", GameClockStopKind.MainPhase), Start.AddSeconds(70));

        Assert.AreEqual(1, clock.ConsecutiveTimeouts("p2"));
        Assert.AreEqual(0, clock.ConsecutiveTimeouts("p1"));
    }

    [TestMethod]
    public void RegisterTimeout_CountsAStrike_AndChargesTheStopBudget()
    {
        var clock = CreateClock();
        clock.SyncTo(new GameClockStop("p1", GameClockStopKind.OtherStep), Start);

        var strikes = clock.RegisterTimeout(Start.AddSeconds(30));

        Assert.AreEqual(1, strikes);
        Assert.AreEqual(TimeSpan.FromSeconds(1770), clock.RemainingPool("p1"));
        Assert.IsNull(clock.DeadlineUtc);
    }

    [TestMethod]
    public void SyncTo_ChargesTheOutgoingOwner_OnlyForTheTimeTheyUsed()
    {
        var clock = CreateClock();
        clock.SyncTo(new GameClockStop("p1", GameClockStopKind.MainPhase), Start);

        // The reaction window hands priority to the defender: p1 is charged for the ten seconds they had, and p2
        // starts with a whole stop.
        clock.SyncTo(new GameClockStop("p2", GameClockStopKind.OtherStep), Start.AddSeconds(10));

        Assert.AreEqual(TimeSpan.FromSeconds(1790), clock.RemainingPool("p1"));
        Assert.AreEqual(TimeSpan.FromSeconds(1800), clock.RemainingPool("p2"));
        Assert.AreEqual("p2", clock.OwningPlayerId);
    }

    [TestMethod]
    public void SyncTo_ChargesNoMoreThanTheStopBudget_HoweverManyReconciliationsHappen()
    {
        var clock = CreateClock();
        var stop = new GameClockStop("p1", GameClockStopKind.MainPhase);

        clock.SyncTo(stop, Start);
        clock.SyncTo(stop, Start.AddSeconds(10));
        clock.SyncTo(stop, Start.AddSeconds(100));
        clock.SyncTo(stop, Start.AddSeconds(200));

        Assert.AreEqual(TimeSpan.FromSeconds(1740), clock.RemainingPool("p1"));
    }

    [TestMethod]
    public void SyncTo_ReportsThePlayerWhosePoolJustRanOut()
    {
        var policy = GameClockPolicy.FromSeconds(
            enabled: true,
            mainPhaseSeconds: 10,
            otherPhaseSeconds: 5,
            playerPoolSeconds: 10,
            timeoutsBeforeForfeit: 3);
        var clock = CreateClock(policy);
        var stop = new GameClockStop("p1", GameClockStopKind.MainPhase);

        clock.SyncTo(stop, Start);
        var result = clock.SyncTo(stop, Start.AddSeconds(10));

        Assert.AreEqual("p1", result.ExhaustedPlayerId);
        Assert.IsTrue(result.HasExhaustedPool);
        Assert.AreEqual(TimeSpan.Zero, clock.RemainingPool("p1"));
    }

    [TestMethod]
    public void SyncTo_ArmsNothing_WhenThePolicyIsDisabled()
    {
        var clock = CreateClock(GameClockPolicy.Untimed);

        var result = clock.SyncTo(new GameClockStop("p1", GameClockStopKind.MainPhase), Start);

        Assert.IsFalse(result.Rearmed);
        Assert.IsNull(clock.DeadlineUtc);
        Assert.IsNull(clock.OwningPlayerId);
        Assert.IsFalse(clock.IsRunning);
        Assert.IsFalse(clock.IsEnabled);
        // An untimed game never spends its pools either.
        Assert.AreEqual(TimeSpan.FromSeconds(1800), clock.RemainingPool("p1"));
    }
}
