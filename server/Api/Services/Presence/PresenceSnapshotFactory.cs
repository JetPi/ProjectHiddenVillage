using ProjectHiddenVillage.Server.Api.Services.Matchmaking;

namespace ProjectHiddenVillage.Server.Api.Services.Presence;

/// <summary>
/// Builds the one payload both the rest endpoint and the broadcaster publish, so a client painting the number from
/// <c>GET /api/presence</c> and then receiving it over the hub cannot see two different shapes.
/// </summary>
internal static class PresenceSnapshotFactory
{
    internal static PresenceSnapshot Create(
        PresenceCounts counts,
        IReadOnlyList<WaitingPlayersByRuleset> waitingByRuleset)
    {
        return new PresenceSnapshot(
            OnlineViewers: counts.OnlineViewers,
            WaitingByRuleset: waitingByRuleset,
            AuthenticatedViewers: counts.AuthenticatedViewers,
            AnonymousViewers: counts.AnonymousViewers);
    }

    /// <summary>
    /// Records compare their list by reference, so an otherwise unchanged snapshot would look different on every
    /// tick and be rebroadcast forever.
    /// </summary>
    internal static bool AreEquivalent(PresenceSnapshot? left, PresenceSnapshot? right)
    {
        if (left is null || right is null)
        {
            return false;
        }

        if (left.OnlineViewers != right.OnlineViewers
            || left.AuthenticatedViewers != right.AuthenticatedViewers
            || left.AnonymousViewers != right.AnonymousViewers
            || left.WaitingByRuleset.Count != right.WaitingByRuleset.Count)
        {
            return false;
        }

        for (var index = 0; index < left.WaitingByRuleset.Count; index++)
        {
            var leftSummary = left.WaitingByRuleset[index];
            var rightSummary = right.WaitingByRuleset[index];

            if (leftSummary.RulesetId != rightSummary.RulesetId
                || leftSummary.WaitingCount != rightSummary.WaitingCount
                || !string.Equals(leftSummary.RulesetName, rightSummary.RulesetName, StringComparison.Ordinal))
            {
                return false;
            }
        }

        return true;
    }
}
