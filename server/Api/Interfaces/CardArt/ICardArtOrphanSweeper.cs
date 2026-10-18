namespace ProjectHiddenVillage.Server.Api.Interfaces.CardArt;

/// <summary>
/// Collects stored art that nothing references any more - the master of a create that was abandoned, and the
/// cached variants of cards that no longer exist.
/// </summary>
/// <remarks>
/// Sweeps are triggered by writes and rate-limited by <c>CardArt:OrphanSweepIntervalMinutes</c> rather than by a
/// timer: this deployment has no hosted service yet, and an idle server has no orphans to collect. The throttle
/// is process-wide, so a multi-instance deployment would need a real scheduler instead.
/// </remarks>
public interface ICardArtOrphanSweeper
{
    /// <summary>Runs a sweep if one is due, and does nothing otherwise.</summary>
    Task SweepIfDueAsync(CancellationToken cancellationToken);
}
