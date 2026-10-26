namespace ProjectHiddenVillage.Server.Api.Services.Guests;

public sealed class GuestUserOptions
{
    public const string SectionName = "Guests";

    /// <summary>
    /// How long a guest row may sit unused before the retention sweeper deletes it, measured from the last time
    /// the guest proved they were around (a session mint, a game entry, a matchmaking enqueue) rather than from
    /// creation. One week is the product rule: long enough that a returning player keeps their identity and the
    /// transient deck attached to it, short enough that the table tracks recently abandoned guests instead of
    /// the whole history of the site.
    /// </summary>
    public int RetentionDays { get; set; } = 7;

    /// <summary>
    /// How often the sweeper runs. Rows that have been idle for a week are not urgent, so this only decides
    /// how stale the table is allowed to get.
    /// </summary>
    public int SweepIntervalMinutes { get; set; } = 60;

    /// <summary>
    /// Rows collected per sweep. Bounded so the first sweep against a large table cannot hold locks for long;
    /// anything left over is picked up by the next one.
    /// </summary>
    public int SweepBatchSize { get; set; } = 250;

    /// <summary>
    /// Minimum time between two <c>LastSeenAtUtc</c> writes for the same guest. Without it every request that
    /// touches a game would write a row just to record "still here".
    /// </summary>
    public int TouchThrottleMinutes { get; set; } = 10;
}
