namespace ProjectHiddenVillage.Server;

/// <summary>
/// A player asking for a quick match. The deck is whatever they want to bring: the server judges it against the
/// ruleset, so the client never gets to decide whether a deck is legal.
/// </summary>
public sealed record EnqueueMatchRequest(Guid UserId, Guid DeckId, Guid RulesetId);

/// <summary>The state of a queue ticket. A client polls until <see cref="matched"/> or a terminal state.</summary>
public static class MatchTicketStates
{
    public const string Waiting = "waiting";
    public const string Matched = "matched";
    public const string Cancelled = "cancelled";
    public const string Expired = "expired";
}

public sealed record MatchTicketResponse(
    string TicketId,
    Guid RulesetId,
    string RulesetName,
    string State,
    string? GameId,
    string? OpponentName,
    DateTimeOffset EnqueuedAtUtc);

/// <summary>How many players are waiting in one format right now, after abandoned tickets were pruned.</summary>
public sealed record WaitingPlayersByRuleset(Guid RulesetId, string RulesetName, int WaitingCount);
