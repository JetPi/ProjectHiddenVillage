namespace ProjectHiddenVillage.Server.Api.Services.CardArt;

/// <summary>
/// Decides what an art sweep may collect. Kept as a pure policy so the rules - nothing still referenced, nothing
/// touched inside the grace window - are testable without a database or a filesystem, which is where a deletion
/// bug would otherwise hide.
/// </summary>
public static class CardArtOrphanPolicy
{
    /// <summary>
    /// True when a stored master is unreferenced by any card and has been untouched for the grace window. The
    /// grace window is what protects an upload whose create request has not landed yet.
    /// </summary>
    public static bool IsCollectableMaster(
        string reference,
        IReadOnlySet<string> referencedImages,
        DateTimeOffset lastWriteUtc,
        DateTimeOffset now,
        TimeSpan grace)
    {
        if (string.IsNullOrWhiteSpace(reference) || referencedImages.Contains(reference))
        {
            return false;
        }

        return IsPastGrace(lastWriteUtc, now, grace);
    }

    /// <summary>
    /// True when a cached variant belongs to a card id that no longer exists and is old enough to collect. A
    /// variant that is merely out of date is left alone: it is keyed by the card's version, so it will simply stop
    /// being read rather than being wrong.
    /// </summary>
    public static bool IsCollectableVariant(
        string cardId,
        IReadOnlySet<string> existingCardIds,
        DateTimeOffset lastWriteUtc,
        DateTimeOffset now,
        TimeSpan grace)
    {
        if (string.IsNullOrWhiteSpace(cardId) || existingCardIds.Contains(cardId))
        {
            return false;
        }

        return IsPastGrace(lastWriteUtc, now, grace);
    }

    private static bool IsPastGrace(DateTimeOffset lastWriteUtc, DateTimeOffset now, TimeSpan grace)
    {
        // A file stamped in the future (a clock that moved) is treated as fresh rather than as collectable.
        var age = now - lastWriteUtc;

        return age >= grace && age >= TimeSpan.Zero;
    }
}
