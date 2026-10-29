namespace ProjectHiddenVillage.Server.Data.Entities;

/// <summary>
/// One player's record with one deck.
///
/// It is deliberately not a property of <see cref="Deck"/>: a deck is shared - public decks are played by many
/// players, and a saved deck belongs to one player - while a record belongs to a single player. Keying on
/// (DeckId, UserId) is what lets two players keep their own wins and losses on the same public deck, and it is
/// why a deck that was never played needs no row at all: the absence of a row is 0 on both counters.
/// </summary>
public sealed class DeckRecord
{
    public Guid DeckId { get; set; }

    public Deck Deck { get; set; } = null!;

    public Guid UserId { get; set; }

    public User User { get; set; } = null!;

    public int Wins { get; set; }

    public int Losses { get; set; }

    /// <summary>
    /// Games that ended with no winner at all (both leaders fell in the same instant and every tiebreak tied).
    /// Kept apart from <see cref="Losses"/> so a draw can never be read as a defeat; the win rate stays
    /// wins / (wins + losses).
    /// </summary>
    public int Draws { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}
