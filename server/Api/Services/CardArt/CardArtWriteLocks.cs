using System.Collections.Concurrent;

namespace ProjectHiddenVillage.Server.Api.Services.CardArt;

/// <summary>
/// One writer per card. A card's stored master and its cached width variants are both keyed by the card id, and
/// the variant file names carry the card's updated timestamp rather than the master's - so an upload landing
/// while a variant is being built would let the read path cache a variant decoded from the previous master,
/// under a name that will never expire.
/// </summary>
internal static class CardArtWriteLocks
{
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> Locks = new(StringComparer.Ordinal);

    public static SemaphoreSlim ForCard(string safeCardId)
    {
        return Locks.GetOrAdd(safeCardId, static _ => new SemaphoreSlim(1, 1));
    }
}
