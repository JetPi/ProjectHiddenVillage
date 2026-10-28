using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ProjectHiddenVillage.Server.Api.Services.Rematch;

/// <summary>
/// Drops rematch reservations nobody came back for, which is what returns their codes to the allocator. It runs on a
/// timer for the same reason the guest sweeper does: an abandoned reservation is not discovered by any request, so
/// nothing else would ever collect it.
/// </summary>
public sealed class RematchReservationSweeper(
    RematchReservationStore reservations,
    RematchOptions options,
    TimeProvider timeProvider,
    ILogger<RematchReservationSweeper> logger) : BackgroundService
{
    private const int SweepIntervalSeconds = 30;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Enabled)
        {
            return;
        }

        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(SweepIntervalSeconds), timeProvider);

        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                var released = reservations.PruneExpired();

                if (released.Count > 0)
                {
                    logger.LogInformation(
                        "Released {Count} expired rematch reservation(s): {Codes}",
                        released.Count,
                        string.Join(",", released));
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Shutting down: the reservations die with the process anyway.
        }
    }
}
