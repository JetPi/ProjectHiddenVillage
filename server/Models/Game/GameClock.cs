namespace ProjectHiddenVillage.Server;

/// <summary>Which budget a stop draws from.</summary>
public enum GameClockStopKind
{
    /// <summary>Nobody is being waited on: the engine is draining, a presentation is out, or the game is over.</summary>
    None = 0,

    /// <summary>The active player's main phase, which has its own (longer) budget.</summary>
    MainPhase = 1,

    /// <summary>Any other interactive stop: a prompt, a cut-in window, an action step.</summary>
    OtherStep = 2
}

/// <summary>
/// "Who does the engine owe an answer from right now, and of what kind". <see cref="OwningPlayerId"/> is null
/// exactly when nobody is being waited on.
/// </summary>
public readonly record struct GameClockStop(string? OwningPlayerId, GameClockStopKind Kind)
{
    public static GameClockStop None => new(OwningPlayerId: null, Kind: GameClockStopKind.None);

    public bool HasOwner => !string.IsNullOrWhiteSpace(OwningPlayerId) && Kind != GameClockStopKind.None;
}

/// <summary>What one clock reconciliation changed, so the caller knows what to do about it.</summary>
public sealed record GameClockSyncResult(bool OwnerChanged, bool Rearmed, string? ExhaustedPlayerId)
{
    public static readonly GameClockSyncResult Unchanged = new(OwnerChanged: false, Rearmed: false, ExhaustedPlayerId: null);

    /// <summary>True when the player in <see cref="ExhaustedPlayerId"/> has just run out of pool.</summary>
    public bool HasExhaustedPool => ExhaustedPlayerId is not null;
}

/// <summary>
/// The action clock of one game: a per-player pool, per-player consecutive-timeout counters, and the deadline of
/// the stop the engine is currently waiting on. See <c>plans/game-action-clocks.md</c>.
///
/// The clock never reads a wall clock itself: every entry point takes <c>now</c>, which the registry reads from its
/// <see cref="TimeProvider"/>. That is what makes the timeout paths testable without real waits.
///
/// Charging is incremental and clamped: the time between two reconciliations is subtracted from the owning
/// player's pool, but a single stop can never consume more than its budget, so a late watchdog firing cannot
/// double-charge a player who already timed out.
/// </summary>
public sealed class GameClock
{
    private readonly GameClockPolicy policy;
    private readonly TimeProvider timeProvider;
    private readonly Dictionary<string, TimeSpan> remainingPoolByPlayerId = new(StringComparer.Ordinal);
    private readonly Dictionary<string, int> consecutiveTimeoutsByPlayerId = new(StringComparer.Ordinal);

    private DateTimeOffset? chargedAtUtc;
    private TimeSpan consumedInStop;
    private long deadlineToken;

    public GameClock(GameClockPolicy policy, TimeProvider? timeProvider = null)
    {
        this.policy = policy ?? throw new ArgumentNullException(nameof(policy));
        // Only used to stamp the payload's "server now" and to read the remaining time for a response; every
        // state-changing entry point still takes its own `now`, so a test drives one clock and gets one answer.
        this.timeProvider = timeProvider ?? TimeProvider.System;
    }

    public GameClockPolicy Policy => policy;

    public TimeProvider TimeProvider => timeProvider;

    /// <summary>The server's own reading of now, from the clock the deadlines are armed with.</summary>
    public DateTimeOffset UtcNow => timeProvider.GetUtcNow();

    /// <summary>The player the engine is waiting on, or null while it is not waiting on anybody.</summary>
    public string? OwningPlayerId { get; private set; }

    public GameClockStopKind StopKind { get; private set; } = GameClockStopKind.None;

    /// <summary>When the current stop times out. Null while the clock is stopped or disabled.</summary>
    public DateTimeOffset? DeadlineUtc { get; private set; }

    /// <summary>
    /// Bumped on every re-arm. The watchdog that fires for a deadline quotes the token it was armed with, so a
    /// stale timer can never end a stop that has already moved on.
    /// </summary>
    public long DeadlineToken => deadlineToken;

    public bool IsEnabled => policy.Enabled;

    public bool IsRunning => policy.Enabled && OwningPlayerId is not null && DeadlineUtc is not null;

    public IReadOnlyCollection<string> TrackedPlayerIds => remainingPoolByPlayerId.Keys;

    /// <summary>
    /// Seeds the pool of every player that does not have one yet. It is called at every mutation boundary, so it
    /// deliberately touches nothing else: an armed deadline, the charged time and the strikes all survive.
    /// </summary>
    public void Start(IEnumerable<string> playerIds)
    {
        ArgumentNullException.ThrowIfNull(playerIds);

        foreach (var playerId in playerIds)
        {
            if (string.IsNullOrWhiteSpace(playerId) || remainingPoolByPlayerId.ContainsKey(playerId))
            {
                continue;
            }

            remainingPoolByPlayerId[playerId] = policy.PlayerPoolBudget;
            consecutiveTimeoutsByPlayerId[playerId] = 0;
        }
    }

    public TimeSpan RemainingPool(string playerId)
    {
        return playerId is not null && remainingPoolByPlayerId.TryGetValue(playerId, out var remaining)
            ? remaining
            : TimeSpan.Zero;
    }

    public int ConsecutiveTimeouts(string playerId)
    {
        return playerId is not null && consecutiveTimeoutsByPlayerId.TryGetValue(playerId, out var count)
            ? count
            : 0;
    }

    public TimeSpan? RemainingInStop(DateTimeOffset now)
    {
        if (DeadlineUtc is not { } deadline)
        {
            return null;
        }

        var remaining = deadline - now;
        return remaining < TimeSpan.Zero ? TimeSpan.Zero : remaining;
    }

    /// <summary>
    /// Reconciles the clock with the stop the engine is on. Charges the outgoing owner for the time they used,
    /// resets strikes for a player who just submitted something, and re-arms the deadline when the owner changes,
    /// when the owner acted, or when <paramref name="forceRearm"/> is set (a timeout that changed nothing).
    /// </summary>
    public GameClockSyncResult SyncTo(
        GameClockStop stop,
        DateTimeOffset now,
        string? actingPlayerId = null,
        bool forceRearm = false)
    {
        if (!policy.Enabled)
        {
            Stop();
            return GameClockSyncResult.Unchanged;
        }

        var normalizedOwner = stop.HasOwner ? stop.OwningPlayerId : null;
        var normalizedKind = normalizedOwner is null ? GameClockStopKind.None : stop.Kind;

        var ownerChanged = !string.Equals(OwningPlayerId, normalizedOwner, StringComparison.Ordinal)
            || StopKind != normalizedKind;

        var isOwnInput = actingPlayerId is not null
            && normalizedOwner is not null
            && string.Equals(actingPlayerId, normalizedOwner, StringComparison.Ordinal);

        // Strikes are about "did this player answer", not about the deadline: an input clears them even when the
        // ruleset does not refresh the stop's budget on action.
        if (isOwnInput)
        {
            consecutiveTimeoutsByPlayerId[actingPlayerId!] = 0;
        }

        var exhaustedPlayerId = ChargeCurrentStop(now);

        if (normalizedOwner is null)
        {
            OwningPlayerId = null;
            StopKind = GameClockStopKind.None;
            DeadlineUtc = null;
            chargedAtUtc = null;
            consumedInStop = TimeSpan.Zero;
            deadlineToken++;
            return new GameClockSyncResult(ownerChanged, Rearmed: true, exhaustedPlayerId);
        }

        OwningPlayerId = normalizedOwner;
        StopKind = normalizedKind;

        var shouldArm = forceRearm
            || ownerChanged
            || DeadlineUtc is null
            || chargedAtUtc is null
            || (isOwnInput && policy.RefreshOnAction);

        if (!shouldArm)
        {
            return new GameClockSyncResult(ownerChanged, Rearmed: false, exhaustedPlayerId);
        }

        Arm(now);
        return new GameClockSyncResult(ownerChanged, Rearmed: true, exhaustedPlayerId);
    }

    /// <summary>
    /// Records that the current stop ran out of time: charges the rest of its budget and increments the owning
    /// player's consecutive-timeout count. The caller then applies the passive action and re-syncs (with
    /// <c>forceRearm</c> when the passive action could not change the stop).
    /// </summary>
    public int RegisterTimeout(DateTimeOffset now)
    {
        if (OwningPlayerId is not { } owner)
        {
            return 0;
        }

        ChargeCurrentStop(now);
        DeadlineUtc = null;
        chargedAtUtc = null;
        consumedInStop = TimeSpan.Zero;
        deadlineToken++;

        var strikes = ConsecutiveTimeouts(owner) + 1;
        consecutiveTimeoutsByPlayerId[owner] = strikes;
        return strikes;
    }

    /// <summary>Stops the clock for good (game over, or a disabled policy).</summary>
    public void Stop()
    {
        OwningPlayerId = null;
        StopKind = GameClockStopKind.None;
        DeadlineUtc = null;
        chargedAtUtc = null;
        consumedInStop = TimeSpan.Zero;
        deadlineToken++;
    }

    private void Arm(DateTimeOffset now)
    {
        DeadlineUtc = now + BudgetFor(StopKind);
        chargedAtUtc = now;
        consumedInStop = TimeSpan.Zero;
        deadlineToken++;
    }

    private TimeSpan BudgetFor(GameClockStopKind kind)
    {
        return kind == GameClockStopKind.None ? TimeSpan.Zero : policy.BudgetFor(kind == GameClockStopKind.MainPhase);
    }

    /// <summary>
    /// Subtracts the time consumed since the last reconciliation from the owning player's pool, capped by what is
    /// left of the current stop's budget. Returns the player whose pool just reached zero, if any.
    /// </summary>
    private string? ChargeCurrentStop(DateTimeOffset now)
    {
        if (OwningPlayerId is not { } owner || chargedAtUtc is not { } chargedAt)
        {
            return null;
        }

        var elapsed = now - chargedAt;
        if (elapsed < TimeSpan.Zero)
        {
            elapsed = TimeSpan.Zero;
        }

        var remainingBudget = BudgetFor(StopKind) - consumedInStop;
        if (remainingBudget < TimeSpan.Zero)
            remainingBudget = TimeSpan.Zero;

        var charged = elapsed > remainingBudget ? remainingBudget : elapsed;
        consumedInStop += charged;
        chargedAtUtc = now;

        if (charged <= TimeSpan.Zero)
        {
            return null;
        }

        remainingPoolByPlayerId.TryGetValue(owner, out var remaining);
        remaining -= charged;
        if (remaining < TimeSpan.Zero)
        {
            remaining = TimeSpan.Zero;
        }

        remainingPoolByPlayerId[owner] = remaining;
        return remaining <= TimeSpan.Zero ? owner : null;
    }
}
