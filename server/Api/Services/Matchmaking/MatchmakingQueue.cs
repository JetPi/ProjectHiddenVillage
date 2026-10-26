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
/// The tickets currently in flight, shared by every request. It is deliberately the only stateful part of
/// matchmaking: pairing itself lives in the scoped service, which needs the request-scoped database services.
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
}
