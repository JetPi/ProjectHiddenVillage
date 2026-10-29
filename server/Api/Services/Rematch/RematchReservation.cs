namespace ProjectHiddenVillage.Server.Api.Services.Rematch;

/// <summary>
/// A table code claimed for two named players before anybody has sat down: the rematch lobby.
///
/// It is deliberately not a <see cref="GameInstance"/>. The engine starts a game when it has two players, and a
/// reservation exists precisely to hold the code while zero or one player is seated - the window in which each
/// player goes to the login view to pick the deck they will bring to the next match.
///
/// Everything that must not change between matches is snapshotted here at the moment both players agreed: the
/// ruleset binding (its clock policy included) and the table's modifiers. The decks are judged against the live
/// definition of that same format when the players claim their seats.
/// </summary>
public sealed class RematchReservation
{
    /// <summary>The reserved game code; claimed in the allocator from the moment this object exists.</summary>
    public required string Code { get; init; }

    /// <summary>The finished table the rematch came from. It is also the hub group the reservation is announced in.</summary>
    public required string SourceGameId { get; init; }

    /// <summary>The format the next match is played in, or <c>null</c> when the source table was unbound.</summary>
    public GameRulesetBinding? Ruleset { get; init; }

    /// <summary>The source table's host-only modifiers; a time-relaxed table stays time-relaxed.</summary>
    public IReadOnlyList<string> Modifiers { get; init; } = [];

    /// <summary>The two players who agreed to the rematch, in the source table's seat order.</summary>
    public required IReadOnlyList<string> PlayerIds { get; init; }

    public DateTimeOffset CreatedAtUtc { get; init; }

    public DateTimeOffset ExpiresAtUtc { get; init; }

    /// <summary>
    /// Serialises the two claims. The first claim creates the table and the second joins it, and they can arrive at
    /// the same instant from two browsers, so the "does the table exist yet" decision has to be made under a lock
    /// that is held across the create.
    /// </summary>
    public SemaphoreSlim ClaimLock { get; } = new(1, 1);

    /// <summary>
    /// The release a player asked for, waiting out its grace. A departure and a refresh unmount the login view the
    /// same way, so a release is recorded rather than applied: it only lands if nobody comes back before its due
    /// time. Mutated under <c>lock (reservation)</c>, which is the monitor the store and the service share.
    /// </summary>
    public string? PendingReleasePlayerId { get; private set; }

    public DateTimeOffset? PendingReleaseDueAtUtc { get; private set; }

    public bool HasSeat(string playerId)
    {
        return PlayerIds.Any(id => string.Equals(id, playerId, StringComparison.Ordinal));
    }

    public bool IsExpired(DateTimeOffset now)
    {
        return now >= ExpiresAtUtc;
    }

    /// <summary>
    /// Records the caller's release. Idempotent on purpose: a page can fire it twice (unmount and <c>pagehide</c>),
    /// and the second call is the same request rather than a reason to fail.
    /// </summary>
    public void RequestRelease(string playerId, DateTimeOffset now, TimeSpan grace)
    {
        PendingReleasePlayerId = playerId;
        PendingReleaseDueAtUtc = now.Add(grace);
    }

    /// <summary>
    /// Clears the release when the player who asked for it proves they are still there. Only that player can: the
    /// opponent watching a banner is not a commitment to the rematch.
    /// </summary>
    public bool CancelPendingRelease(string playerId)
    {
        if (!string.Equals(PendingReleasePlayerId, playerId, StringComparison.Ordinal))
        {
            return false;
        }

        ClearPendingRelease();
        return true;
    }

    /// <summary>A claim by either seat makes the release moot: the agreement is being acted on.</summary>
    public void ClearPendingRelease()
    {
        PendingReleasePlayerId = null;
        PendingReleaseDueAtUtc = null;
    }

    public bool IsReleaseDue(DateTimeOffset now)
    {
        return PendingReleaseDueAtUtc is { } dueAtUtc && now >= dueAtUtc;
    }
}
