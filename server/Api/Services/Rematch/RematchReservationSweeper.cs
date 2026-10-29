using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ProjectHiddenVillage.Server.Api.Hubs;

namespace ProjectHiddenVillage.Server.Api.Services.Rematch;

/// <summary>
/// Applies the endings nobody requests: a reservation whose time ran out, and one a player released and never came
/// back for. It runs on a timer for the same reason the guest sweeper does - an abandoned reservation is not
/// discovered by any request - and it is also what tells a board whose opponent walked away.
/// </summary>
public sealed class RematchReservationSweeper(
    RematchReservationStore reservations,
    RematchOptions options,
    TimeProvider timeProvider,
    IHubContext<GamesHub> gamesHubContext,
    ILogger<RematchReservationSweeper> logger) : BackgroundService
{
    /// <summary>
    /// Ten seconds, so a release's grace lands within a bounded, short window: the sweep is what turns a due release
    /// into a dropped reservation, and a player waiting on the other side should not wait much longer than the grace.
    /// </summary>
    private const int SweepIntervalSeconds = 10;

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
                foreach (var drop in reservations.Prune())
                {
                    await AnnounceDropAsync(drop, stoppingToken);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Shutting down: the reservations die with the process anyway.
        }
    }

    /// <summary>
    /// The code is already released by the time this runs. What is left is telling the players: a table that had been
    /// opened under the code was just retired, and the player sitting on it must not be left watching a board that
    /// no longer accepts anything.
    /// </summary>
    private async Task AnnounceDropAsync(RematchReservationDrop drop, CancellationToken cancellationToken)
    {
        logger.LogInformation(
            "Dropped rematch reservation {Code} ({Reason}); table retired: {TableRetired}; released by: {PlayerId}",
            drop.Code,
            drop.Reason,
            drop.TableRetired,
            drop.ReleasedByPlayerId ?? "nobody");

        if (!drop.TableRetired)
        {
            return;
        }

        try
        {
            await gamesHubContext.Clients
                .Group(drop.Code)
                .SendAsync("RematchReleased", drop.Code, drop.Reason.ToString(), cancellationToken);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            // Best effort: the board is gone either way, and the client's own hub recovery covers a missed event.
            logger.LogWarning(exception, "Announcing the dropped rematch {Code} failed.", drop.Code);
        }
    }
}
