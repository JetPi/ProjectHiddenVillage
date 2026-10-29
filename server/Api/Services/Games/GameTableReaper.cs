using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

/// <summary>
/// Retires tables that have gone out of use, which is what returns their game codes to the allocator.
///
/// Nothing used to be removed from the registry: a finished game kept its code (and its board) until the process
/// restarted, so a code could never be handed out again and memory grew with every game ever hosted. A table is
/// retired when nobody is watching it and the grace window for its state has passed; a table somebody is still
/// looking at is never touched, however finished it is.
///
/// The grace is measured from the moment the sweep first observed the table as eligible rather than from a
/// timestamp stamped on the game, so the sweep can be driven by a fake <see cref="TimeProvider"/> in tests and the
/// engine stays free of lifecycle bookkeeping.
/// </summary>
public sealed class GameTableReaper : BackgroundService
{
    private readonly InMemoryGameInstanceRegistry registry;
    private readonly IGamePresenceTracker presenceTracker;
    private readonly GameRetirementOptions options;
    private readonly TimeProvider timeProvider;
    private readonly ILogger<GameTableReaper> logger;

    /// <summary>When the sweep first saw each table become eligible, keyed by game code.</summary>
    private readonly Dictionary<string, DateTimeOffset> eligibleSince = new(StringComparer.Ordinal);

    public GameTableReaper(
        InMemoryGameInstanceRegistry registry,
        IGamePresenceTracker presenceTracker,
        GameRetirementOptions options,
        TimeProvider timeProvider,
        ILogger<GameTableReaper> logger)
    {
        this.registry = registry;
        this.presenceTracker = presenceTracker;
        this.options = options;
        this.timeProvider = timeProvider;
        this.logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Enabled)
        {
            logger.LogInformation("Game table retirement is disabled; game codes will not be released.");
            return;
        }

        var interval = TimeSpan.FromSeconds(Math.Max(1, options.SweepIntervalSeconds));
        using var timer = new PeriodicTimer(interval, timeProvider);

        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                Sweep();
            }
        }
        catch (OperationCanceledException)
        {
            // Shutting down: the tables die with the process anyway.
        }
    }

    /// <summary>
    /// One retirement pass. Returns the codes it retired, which is also how the tests assert the sweep without
    /// waiting on a timer.
    /// </summary>
    public IReadOnlyList<string> Sweep()
    {
        if (!options.Enabled)
        {
            return [];
        }

        var now = timeProvider.GetUtcNow();
        var retired = new List<string>();
        var liveGameIds = new HashSet<string>(StringComparer.Ordinal);

        foreach (var instance in registry.Snapshot())
        {
            var gameId = instance.Id;
            liveGameIds.Add(gameId);

            var grace = ResolveGrace(instance);
            if (grace is null)
            {
                eligibleSince.Remove(gameId);
                continue;
            }

            // Somebody is still on the board: the table is in use no matter how finished it is, and the grace
            // starts over from the moment they leave.
            if (presenceTracker.GetConnectedPlayerIds(gameId).Count > 0)
            {
                eligibleSince.Remove(gameId);
                continue;
            }

            if (!eligibleSince.TryGetValue(gameId, out var observedAt))
            {
                eligibleSince[gameId] = now;
                continue;
            }

            if (now - observedAt < grace.Value)
            {
                continue;
            }

            if (registry.TryRetire(gameId))
            {
                retired.Add(gameId);
            }

            eligibleSince.Remove(gameId);
        }

        // Forget tables that left the registry some other way, so the bookkeeping cannot outlive them.
        foreach (var stale in eligibleSince.Keys.Where(gameId => !liveGameIds.Contains(gameId)).ToList())
        {
            eligibleSince.Remove(stale);
        }

        if (retired.Count > 0)
        {
            logger.LogInformation(
                "Retired {Count} game table(s), releasing their codes: {GameIds}",
                retired.Count,
                string.Join(",", retired));
        }

        return retired;
    }

    /// <summary>
    /// How long this table must sit unwatched before it is retired, or <c>null</c> when it must be kept. A running
    /// game is kept unless <see cref="GameRetirementOptions.UnwatchedRunningGraceSeconds"/> explicitly asks
    /// otherwise: the players may simply have closed the tab.
    /// </summary>
    private TimeSpan? ResolveGrace(GameInstance instance)
    {
        if (GameEndRules.IsGameOver(instance.State))
        {
            return TimeSpan.FromSeconds(Math.Max(0, options.FinishedGraceSeconds));
        }

        if (instance.State.Players.Count < 2)
        {
            return TimeSpan.FromSeconds(Math.Max(0, options.AbandonedGraceSeconds));
        }

        return options.UnwatchedRunningGraceSeconds > 0
            ? TimeSpan.FromSeconds(options.UnwatchedRunningGraceSeconds)
            : null;
    }
}
