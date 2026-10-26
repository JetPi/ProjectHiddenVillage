using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.Matchmaking;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class MatchmakingQueueSummaryTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 26, 12, 0, 0, TimeSpan.Zero);

    private static readonly TimeSpan WaitingLifetime = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan FinishedRetention = TimeSpan.FromMinutes(2);

    [TestMethod]
    public void GetWaitingSummary_CountsWaitingTicketsPerRulesetAndIgnoresFinishedOnes()
    {
        var queue = new MatchmakingQueue();
        var standardId = Guid.NewGuid();
        var preReleaseId = Guid.NewGuid();

        queue.Add(CreateTicket(standardId, "Standard", Guid.NewGuid(), Now));
        queue.Add(CreateTicket(standardId, "Standard", Guid.NewGuid(), Now.AddSeconds(-5)));
        queue.Add(CreateTicket(preReleaseId, "Pre-Release", Guid.NewGuid(), Now));
        queue.Add(CreateTicket(standardId, "Standard", Guid.NewGuid(), Now, state: MatchTicketStates.Matched));

        var summary = queue.GetWaitingSummary(Now, WaitingLifetime, FinishedRetention);

        Assert.AreEqual(2, summary.Count);
        Assert.AreEqual(standardId, summary[0].RulesetId);
        Assert.AreEqual(2, summary[0].WaitingCount);
        Assert.AreEqual(preReleaseId, summary[1].RulesetId);
        Assert.AreEqual(1, summary[1].WaitingCount);
    }

    [TestMethod]
    public void GetWaitingSummary_ExcludesTicketsThatOutlivedTheirLifetime()
    {
        var queue = new MatchmakingQueue();
        var rulesetId = Guid.NewGuid();
        var abandoned = CreateTicket(rulesetId, "Standard", Guid.NewGuid(), Now.AddMinutes(-10));
        queue.Add(abandoned);

        var summary = queue.GetWaitingSummary(Now, WaitingLifetime, FinishedRetention);

        Assert.AreEqual(0, summary.Count);
        Assert.AreEqual(
            MatchTicketStates.Expired,
            abandoned.State,
            "Reading the summary is what expires an abandoned ticket, so a closed tab stops counting.");
    }

    [TestMethod]
    public void PruneExpiredTickets_DropsFinishedTicketsAfterTheirRetention()
    {
        var queue = new MatchmakingQueue();
        var rulesetId = Guid.NewGuid();
        var matched = CreateTicket(rulesetId, "Standard", Guid.NewGuid(), Now.AddMinutes(-10));
        matched.State = MatchTicketStates.Matched;
        matched.FinishedAtUtc = Now.AddMinutes(-10);
        queue.Add(matched);

        queue.PruneExpiredTickets(Now, WaitingLifetime, FinishedRetention);

        Assert.IsFalse(queue.TryGet(matched.Id, out _));
    }

    private static MatchTicket CreateTicket(
        Guid rulesetId,
        string rulesetName,
        Guid userId,
        DateTimeOffset enqueuedAtUtc,
        string state = MatchTicketStates.Waiting)
    {
        return new MatchTicket
        {
            RulesetId = rulesetId,
            RulesetKey = rulesetName.ToLowerInvariant(),
            RulesetName = rulesetName,
            UserId = userId,
            DeckId = Guid.NewGuid(),
            PlayerName = "player",
            EnqueuedAtUtc = enqueuedAtUtc,
            State = state,
        };
    }
}
