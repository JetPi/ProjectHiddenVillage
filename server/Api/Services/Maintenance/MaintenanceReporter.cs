using Microsoft.Extensions.Options;
using ProjectHiddenVillage.Server.Api.Services.Games;
using ProjectHiddenVillage.Server.Api.Services.Matchmaking;

namespace ProjectHiddenVillage.Server.Api.Services.Maintenance;

public sealed record MaintenanceSnapshot(
    bool Enabled,
    string Message,
    DateTimeOffset? EnabledAtUtc,
    int ActiveGames,
    int WaitingPlayers)
{
    public bool IsDrained => ActiveGames == 0 && WaitingPlayers == 0;
}

/// <summary>
/// Reads the drain numbers off the registry and the queue without taking the game lock: it is a singleton like they
/// are, so both the presence tick and the maintenance endpoint can ask for the same snapshot.
/// </summary>
public sealed class MaintenanceReporter(
    MaintenanceState state,
    InMemoryGameInstanceRegistry registry,
    MatchmakingQueue queue,
    IOptions<MatchmakingOptions> matchmakingOptions,
    TimeProvider timeProvider)
{
    public MaintenanceSnapshot GetSnapshot()
    {
        var activeGames = registry.Snapshot().Count(game =>
            !GameEndRules.IsGameOver(game.State) && game.State.Players.Count > 1);

        var waitingPlayers = queue
            .GetWaitingSummary(timeProvider.GetUtcNow(), WaitingLifetime, FinishedRetention)
            .Sum(entry => entry.WaitingCount);

        return new MaintenanceSnapshot(
            state.IsEnabled,
            state.Message,
            state.EnabledAtUtc,
            activeGames,
            waitingPlayers);
    }

    private TimeSpan WaitingLifetime =>
        TimeSpan.FromSeconds(Math.Max(1, matchmakingOptions.Value.TicketLifetimeSeconds));

    private TimeSpan FinishedRetention =>
        TimeSpan.FromSeconds(Math.Max(1, matchmakingOptions.Value.FinishedTicketRetentionSeconds));
}
