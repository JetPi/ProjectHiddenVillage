using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Options;
using ProjectHiddenVillage.Server.Api.Hubs;
using ProjectHiddenVillage.Server.Api.Services.Maintenance;
using ProjectHiddenVillage.Server.Api.Services.Matchmaking;

namespace ProjectHiddenVillage.Server.Api.Services.Presence;

/// <summary>
/// Ticks the shared snapshot to every connected viewer. It only sends when something actually changed, so an idle
/// site costs nothing beyond the timer, and it owns no logic of its own: the registry and the queue are the
/// sources, and <see cref="PresenceSnapshotFactory"/> keeps this identical to the rest endpoint.
/// </summary>
public sealed class PresenceBroadcaster : BackgroundService
{
    private readonly PresenceRegistry presenceRegistry;
    private readonly MatchmakingQueue matchmakingQueue;
    private readonly MaintenanceReporter maintenanceReporter;
    private readonly IHubContext<PresenceHub> hubContext;
    private readonly MatchmakingOptions matchmakingOptions;
    private readonly PresenceOptions options;
    private readonly TimeProvider timeProvider;
    private readonly ILogger<PresenceBroadcaster> logger;

    public PresenceBroadcaster(
        PresenceRegistry presenceRegistry,
        MatchmakingQueue matchmakingQueue,
        MaintenanceReporter maintenanceReporter,
        IHubContext<PresenceHub> hubContext,
        IOptions<PresenceOptions> options,
        IOptions<MatchmakingOptions> matchmakingOptions,
        TimeProvider timeProvider,
        ILogger<PresenceBroadcaster> logger)
    {
        this.presenceRegistry = presenceRegistry;
        this.matchmakingQueue = matchmakingQueue;
        this.maintenanceReporter = maintenanceReporter;
        this.hubContext = hubContext;
        this.options = options.Value;
        this.matchmakingOptions = matchmakingOptions.Value;
        this.timeProvider = timeProvider;
        this.logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromSeconds(Math.Max(1, options.BroadcastIntervalSeconds));
        PresenceSnapshot? lastPublished = null;

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var snapshot = BuildSnapshot();

                if (!PresenceSnapshotFactory.AreEquivalent(lastPublished, snapshot))
                {
                    await hubContext.Clients.All.SendAsync(
                        PresenceHub.PresenceUpdatedEvent,
                        snapshot,
                        stoppingToken);

                    lastPublished = snapshot;
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                // A failed push must never take the server down; the next tick publishes the whole snapshot again.
                logger.LogError(ex, "Publishing the presence snapshot failed.");
            }

            try
            {
                await Task.Delay(interval, timeProvider, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                return;
            }
        }
    }

    private PresenceSnapshot BuildSnapshot()
    {
        var waitingByRuleset = matchmakingQueue.GetWaitingSummary(
            timeProvider.GetUtcNow(),
            TimeSpan.FromSeconds(Math.Max(1, matchmakingOptions.TicketLifetimeSeconds)),
            TimeSpan.FromSeconds(Math.Max(1, matchmakingOptions.FinishedTicketRetentionSeconds)));

        return PresenceSnapshotFactory.Create(
            presenceRegistry.GetCounts(),
            waitingByRuleset,
            maintenanceReporter.GetSnapshot());
    }
}
