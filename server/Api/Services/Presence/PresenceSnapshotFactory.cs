using ProjectHiddenVillage.Server.Api.Services.Maintenance;
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
        IReadOnlyList<WaitingPlayersByRuleset> waitingByRuleset,
        MaintenanceSnapshot? maintenance = null)
    {
        return new PresenceSnapshot(
            OnlineViewers: counts.OnlineViewers,
            WaitingByRuleset: waitingByRuleset,
            AuthenticatedViewers: counts.AuthenticatedViewers,
            AnonymousViewers: counts.AnonymousViewers,
            MaintenanceEnabled: maintenance?.Enabled ?? false,
            MaintenanceMessage: maintenance?.Message,
            ActiveGames: maintenance?.ActiveGames ?? 0);
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
            || left.WaitingByRuleset.Count != right.WaitingByRuleset.Count
            || left.MaintenanceEnabled != right.MaintenanceEnabled
            || left.ActiveGames != right.ActiveGames
            || !string.Equals(left.MaintenanceMessage, right.MaintenanceMessage, StringComparison.Ordinal))
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
