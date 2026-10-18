using System.Globalization;

namespace ProjectHiddenVillage.Server.Api.Services.CardArt;

/// <summary>
/// Decides what an art sweep may collect. Kept as a pure policy so the rules - nothing still referenced, nothing
/// touched inside the grace window, nothing a card still serves - are testable without a database or a filesystem,
/// which is where a deletion bug would otherwise hide.
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
    /// True when a cached variant can be collected: either its card no longer exists, or the card has moved on to a
    /// newer version - and in both cases only once the file has been untouched for the grace window.
    /// </summary>
    /// <param name="versionsByCardId">
    /// The version each card currently serves, keyed by card id. A card that is absent from this map is gone.
    /// </param>
    /// <param name="variantVersion">The version encoded in the variant's file name.</param>
    /// <remarks>
    /// Collecting by version is what stops the cache growing forever: the version is the card's updated
    /// timestamp, so every edit (including an effects patch that never touches art) mints a new set of variant
    /// file names, and without this rule the previous sets would never be read again but never removed either.
    ///
    /// A variant sitting at the card's *current* version is deliberately kept even when the request that produced
    /// it could not happen any more. Deciding that would need to know whether the card is served from a local
    /// master, which this policy has no business knowing; those files are bounded, are wiped by the next upload
    /// for that card, and are superseded by its next edit anyway.
    /// </remarks>
    public static bool IsCollectableVariant(
        string cardId,
        IReadOnlyDictionary<string, string> versionsByCardId,
        string variantVersion,
        DateTimeOffset lastWriteUtc,
        DateTimeOffset now,
        TimeSpan grace)
    {
        if (string.IsNullOrWhiteSpace(cardId) || !IsPastGrace(lastWriteUtc, now, grace))
        {
            return false;
        }

        if (!versionsByCardId.TryGetValue(cardId, out var currentVersion))
        {
            // Nothing can ask for this card's art again, whatever version the file was built for.
            return true;
        }

        return IsSupersededVersion(variantVersion, currentVersion);
    }

    /// <summary>
    /// Whether a variant was built for a version older than the one its card currently serves. Versions are Unix
    /// timestamps in milliseconds, so this compares them numerically rather than lexically.
    /// </summary>
    /// <remarks>
    /// A version that does not parse, or one *newer* than the card's current version, is deliberately kept. A
    /// client pinned to a version this server does not recognise would otherwise have its variant deleted and
    /// rebuilt on every sweep - a generate/delete loop is worse than holding one stale file.
    /// </remarks>
    private static bool IsSupersededVersion(string variantVersion, string currentVersion)
    {
        return TryParseVersionMilliseconds(variantVersion, out var variantMilliseconds)
            && TryParseVersionMilliseconds(currentVersion, out var currentMilliseconds)
            && variantMilliseconds < currentMilliseconds;
    }

    private static bool TryParseVersionMilliseconds(string version, out long milliseconds)
    {
        if (string.IsNullOrWhiteSpace(version))
        {
            milliseconds = 0;
            return false;
        }

        return long.TryParse(version, NumberStyles.None, CultureInfo.InvariantCulture, out milliseconds);
    }

    private static bool IsPastGrace(DateTimeOffset lastWriteUtc, DateTimeOffset now, TimeSpan grace)
    {
        // A file stamped in the future (a clock that moved) is treated as fresh rather than as collectable.
        var age = now - lastWriteUtc;

        return age >= grace && age >= TimeSpan.Zero;
    }
}
