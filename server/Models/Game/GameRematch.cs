namespace ProjectHiddenVillage.Server;

/// <summary>
/// One player offering another match on the finished board, and the other one answering.
///
/// It is not a <see cref="GamePrompt"/>: the game is over, nothing on the board is being decided, and the offer is
/// only about what happens <em>after</em> this table. Once both seats agree, the accepted offer carries the code of
/// the reserved table both players will claim from the login view - the "lobby" is that reservation, not a game.
/// </summary>
public sealed class RematchOffer
{
    public string RequestId { get; init; } = Guid.NewGuid().ToString("N");

    public string RequestedByPlayerId { get; init; } = string.Empty;

    public DateTimeOffset RequestedAtUtc { get; init; } = DateTimeOffset.UtcNow;

    /// <summary>When an unanswered offer lapses; an accepted one keeps the reservation's own deadline.</summary>
    public DateTimeOffset ExpiresAtUtc { get; init; } = DateTimeOffset.UtcNow;

    /// <summary>The seat that agreed, or <c>null</c> while the offer is still open.</summary>
    public string? AcceptedByPlayerId { get; set; }

    /// <summary>The seat that refused, or <c>null</c>. A refusal ends the offer for both players.</summary>
    public string? DeclinedByPlayerId { get; set; }

    /// <summary>
    /// The reserved table code once both seats agreed. The players take it to the login view, pick a deck and join
    /// it; nobody is seated until then, which is exactly the window a deck change needs.
    /// </summary>
    public string? ReservedCode { get; set; }

    /// <summary>The format the reserved table is bound to, or <c>null</c> for an unbound table.</summary>
    public string? ReservedRulesetName { get; set; }

    public bool IsAccepted => !string.IsNullOrWhiteSpace(AcceptedByPlayerId);

    public bool IsDeclined => !string.IsNullOrWhiteSpace(DeclinedByPlayerId);

    public bool IsReserved => !string.IsNullOrWhiteSpace(ReservedCode);
}
