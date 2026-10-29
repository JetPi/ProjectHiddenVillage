using System.Collections.Concurrent;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Api.Services.Rematch;

/// <summary>Why a reservation stopped existing.</summary>
public enum RematchReservationDropReason
{
    /// <summary>Nobody claimed the table within <see cref="RematchOptions.ReservationLifetimeSeconds"/>.</summary>
    Expired,

    /// <summary>A player left the login view without claiming, and did not come back inside the grace.</summary>
    Released,
}

/// <summary>
/// One reservation the store collected. <see cref="TableRetired"/> is what separates "the code was only reserved"
/// from "a table had been opened under it and was taken down with the agreement".
/// </summary>
public sealed record RematchReservationDrop(
    string Code,
    RematchReservationDropReason Reason,
    string? ReleasedByPlayerId,
    bool TableRetired);

/// <summary>
/// The rematch lobbies of this process, keyed by their reserved code.
///
/// A reservation outlives the table that produced it - that is the whole point of the login-view detour - so it
/// cannot live on the <see cref="GameInstance"/>. It is pruned on a timer (<see cref="RematchReservationSweeper"/>)
/// and lazily whenever somebody looks one up, and pruning is what gives an abandoned code back to the allocator.
///
/// Two things end a reservation besides a successful claim: it expires, or a player releases it. The release is
/// deferred on the reservation itself (see <see cref="RematchReservation.RequestRelease"/>), so a refresh has time to
/// cancel it; this store is where either end is actually applied.
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
    /// Collects every reservation that is due: expired, or released and past its grace. A reservation is only read
    /// here - the caller decides what to tell the players, this returns what it dropped and why.
    /// </summary>
    public IReadOnlyList<RematchReservationDrop> Prune()
    {
        var now = timeProvider.GetUtcNow();
        var drops = new List<RematchReservationDrop>();

        foreach (var reservation in reservations.Values.ToList())
        {
            RematchReservationDropReason? reason = null;
            string? releasedByPlayerId = null;

            lock (reservation)
            {
                if (reservation.IsExpired(now))
                {
                    reason = RematchReservationDropReason.Expired;
                }
                else if (reservation.IsReleaseDue(now))
                {
                    reason = RematchReservationDropReason.Released;
                    releasedByPlayerId = reservation.PendingReleasePlayerId;
                }
            }

            if (reason is null)
            {
                continue;
            }

            drops.Add(Finalize(reservation, reason.Value, releasedByPlayerId));
        }

        return drops;
    }

    /// <summary>
    /// Drops a reservation for good. A one-seat table opened under its code is retired with it - the agreement is
    /// what brought that table into existence - while a table that somehow reached two players is left alone, and a
    /// code nobody opened goes back to the allocator.
    ///
    /// Idempotent: the reservation may already be gone (a claim completed while the sweep was running), and the code
    /// may already have been released by a retirement.
    /// </summary>
    public RematchReservationDrop Finalize(
        RematchReservation reservation,
        RematchReservationDropReason reason,
        string? releasedByPlayerId = null)
    {
        ArgumentNullException.ThrowIfNull(reservation);

        reservations.TryRemove(reservation.Code, out _);

        var tableExists = registry.TryGet(reservation.Code, out var table) && table is not null;
        var isOneSeatTable = tableExists && table!.State.Players.Count < 2;
        var tableRetired = isOneSeatTable && registry.TryRetire(reservation.Code);

        // A code held by a live game belongs to that game: only its retirement releases it, which is why the release
        // below is limited to "no table" and "the table that existed is gone".
        if (!tableExists || (isOneSeatTable && !tableRetired))
        {
            codeAllocator.Release(reservation.Code);
        }

        return new RematchReservationDrop(reservation.Code, reason, releasedByPlayerId, tableRetired);
    }
}
