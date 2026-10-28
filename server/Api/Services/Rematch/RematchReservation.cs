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

    public bool HasSeat(string playerId)
    {
        return PlayerIds.Any(id => string.Equals(id, playerId, StringComparison.Ordinal));
    }

    public bool IsExpired(DateTimeOffset now)
    {
        return now >= ExpiresAtUtc;
    }
}
