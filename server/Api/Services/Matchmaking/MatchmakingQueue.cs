namespace ProjectHiddenVillage.Server.Api.Services.Matchmaking;

/// <summary>
/// One player waiting for, or already given, a quick match. The deck snapshot is kept on purpose: it is the deck
/// the player queued with, so pairing cannot be undone by an edit that lands while they wait.
/// </summary>
public sealed class MatchTicket
{
    public string Id { get; init; } = Guid.NewGuid().ToString("N");

    public Guid RulesetId { get; init; }

    public string RulesetKey { get; init; } = string.Empty;

    public string RulesetName { get; init; } = string.Empty;

    public Guid UserId { get; init; }

    public Guid DeckId { get; init; }

    public string PlayerName { get; init; } = string.Empty;

    public ResolvedPlayerDeck? Deck { get; init; }

    public DateTimeOffset EnqueuedAtUtc { get; init; }

    public DateTimeOffset? FinishedAtUtc { get; set; }

    public string State { get; set; } = MatchTicketStates.Waiting;

    public string? GameId { get; set; }

    public string? OpponentName { get; set; }
}

/// <summary>
/// The tickets currently in flight, shared by every request, and the only owner of their lifetime rules. Pruning
/// lives here rather than in <see cref="MatchmakingService"/> because the presence broadcaster has to read an
/// accurate waiting count from a singleton, without a request scope or a database context.
/// </summary>
public sealed class MatchmakingQueue
{
    private readonly Dictionary<string, MatchTicket> tickets = new(StringComparer.Ordinal);

    /// <summary>Held while tickets are inspected or mutated so two enqueues cannot pair with the same opponent.</summary>
    public object SyncRoot { get; } = new();

    public IReadOnlyList<MatchTicket> Snapshot()
    {
        return tickets.Values.ToList();
    }

    public MatchTicket Add(MatchTicket ticket)
    {
        tickets[ticket.Id] = ticket;
        return ticket;
    }

    public bool TryGet(string ticketId, out MatchTicket? ticket)
    {
        return tickets.TryGetValue(ticketId, out ticket);
    }

    public bool Remove(string ticketId)
    {
        return tickets.Remove(ticketId);
    }

    /// <summary>Expires abandoned waiting tickets and drops finished ones whose grace period ran out.</summary>
    public void PruneExpiredTickets(DateTimeOffset now, TimeSpan waitingLifetime, TimeSpan finishedRetention)
    {
        lock (SyncRoot)
        {
            PruneExpiredTicketsLocked(now, waitingLifetime, finishedRetention);
        }
    }

    /// <summary>
    /// The waiting players per ruleset. Every caller gets an accurate number because the prune runs first:
    /// a ticket that was never read again would otherwise keep counting after its player closed the tab.
    /// </summary>
    public IReadOnlyList<WaitingPlayersByRuleset> GetWaitingSummary(
        DateTimeOffset now,
        TimeSpan waitingLifetime,
        TimeSpan finishedRetention)
    {
        lock (SyncRoot)
        {
            PruneExpiredTicketsLocked(now, waitingLifetime, finishedRetention);

            return tickets.Values
                .Where(ticket => ticket.State == MatchTicketStates.Waiting)
                .GroupBy(ticket => ticket.RulesetId)
                .Select(group => new WaitingPlayersByRuleset(
                    RulesetId: group.Key,
                    RulesetName: group.First().RulesetName,
                    // A player queues once (a re-queue evicts the previous ticket), so distinct users guard the
                    // invariant rather than correct a known duplicate.
                    WaitingCount: group.Select(ticket => ticket.UserId).Distinct().Count()))
                .OrderByDescending(summary => summary.WaitingCount)
                .ThenBy(summary => summary.RulesetName, StringComparer.OrdinalIgnoreCase)
                .ToList();
        }
    }

    internal void PruneExpiredTicketsLocked(DateTimeOffset now, TimeSpan waitingLifetime, TimeSpan finishedRetention)
    {
        foreach (var ticket in tickets.Values.ToList())
        {
            if (ticket.State == MatchTicketStates.Waiting)
            {
                if (now - ticket.EnqueuedAtUtc >= waitingLifetime)
                {
                    ticket.State = MatchTicketStates.Expired;
                    ticket.FinishedAtUtc = now;
                }

                continue;
            }

            var finishedAt = ticket.FinishedAtUtc ?? ticket.EnqueuedAtUtc;
            if (now - finishedAt >= finishedRetention)
            {
                tickets.Remove(ticket.Id);
            }
        }
    }
}
