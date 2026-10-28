using System.Collections.Concurrent;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Api.Services.Rematch;

/// <summary>
/// The rematch lobbies of this process, keyed by their reserved code.
///
/// A reservation outlives the table that produced it - that is the whole point of the login-view detour - so it
/// cannot live on the <see cref="GameInstance"/>. It is pruned on a timer (<see cref="RematchReservationSweeper"/>) and
/// lazily whenever somebody looks one up, and pruning is what gives an abandoned code back to the allocator.
/// </summary>
public sealed class RematchReservationStore(
    IGameCodeAllocator codeAllocator,
    InMemoryGameInstanceRegistry registry,
    TimeProvider timeProvider)
{
    private readonly ConcurrentDictionary<string, RematchReservation> reservations = new(StringComparer.Ordinal);

    public bool TryAdd(RematchReservation reservation)
    {
        ArgumentNullException.ThrowIfNull(reservation);
        return reservations.TryAdd(reservation.Code, reservation);
    }

    public bool TryGet(string code, out RematchReservation? reservation)
    {
        if (string.IsNullOrWhiteSpace(code))
        {
            reservation = null;
            return false;
        }

        return reservations.TryGetValue(code.Trim(), out reservation);
    }

    public bool TryRemove(string code, out RematchReservation? reservation)
    {
        if (string.IsNullOrWhiteSpace(code))
        {
            reservation = null;
            return false;
        }

        return reservations.TryRemove(code.Trim(), out reservation);
    }

    public IReadOnlyList<RematchReservation> Snapshot()
    {
        return reservations.Values.ToList();
    }

    /// <summary>
    /// Drops expired reservations and releases the codes of the ones that never opened a table. A reservation whose
    /// table does exist has handed its claim over to that table, so the code is left alone: retirement releases it.
    /// Returns the codes that were given back.
    /// </summary>
    public IReadOnlyList<string> PruneExpired()
    {
        var now = timeProvider.GetUtcNow();
        var released = new List<string>();

        foreach (var reservation in reservations.Values)
        {
            if (!reservation.IsExpired(now))
            {
                continue;
            }

            if (!reservations.TryRemove(reservation.Code, out _))
            {
                continue;
            }

            if (!registry.TryGet(reservation.Code, out var liveTable) || liveTable is null)
            {
                codeAllocator.Release(reservation.Code);
                released.Add(reservation.Code);
            }
        }

        return released;
    }
}
