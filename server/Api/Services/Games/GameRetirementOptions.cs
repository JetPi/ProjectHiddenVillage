namespace ProjectHiddenVillage.Server.Api.Services.Games;

/// <summary>
/// When a table stops existing. A game code is unique among the tables that are in use, and retirement is what
/// makes a code usable again, so these windows are the release valve for both the registry's memory and the code
/// space: see <see cref="IGameCodeAllocator"/>.
///
/// The defaults keep a finished board reachable for ten minutes after the last player leaves it, which is long
/// enough to reread the log or grab a screenshot, and forget a hosted table nobody ever joined after half an hour.
/// </summary>
public sealed class GameRetirementOptions
{
    public const string SectionName = "GameRetirement";

    /// <summary>Kill switch, so a deployment can stop retiring tables without shipping code.</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>How often the sweep looks at the registry.</summary>
    public int SweepIntervalSeconds { get; set; } = 60;

    /// <summary>How long a finished table survives after its last watcher leaves.</summary>
    public int FinishedGraceSeconds { get; set; } = 600;

    /// <summary>How long a table that never reached two players survives with nobody watching it.</summary>
    public int AbandonedGraceSeconds { get; set; } = 1_800;

    /// <summary>
    /// How long a running game survives with nobody connected at all. Zero (the default) turns the rule off: a
    /// player who closes the tab mid-game may come back, and finding their table gone would be worse than the
    /// memory it costs.
    /// </summary>
    public int UnwatchedRunningGraceSeconds { get; set; }

    /// <summary>
    /// How many retired codes are held back before they can be allocated again. A client still holding an old code
    /// must not be dropped into a stranger's new table that happened to draw it.
    /// </summary>
    public int CodeQuarantineSize { get; set; } = GameCodeAllocator.DefaultQuarantineCapacity;
}
