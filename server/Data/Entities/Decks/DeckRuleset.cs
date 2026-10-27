namespace ProjectHiddenVillage.Server.Data.Entities;

public sealed class DeckRuleset
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string Key { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public bool IsActive { get; set; } = true;

    public int LeaderCount { get; set; } = 1;

    public int NonLeaderCardCount { get; set; }

    public int MaxCopiesPerNonLeaderCard { get; set; } = 4;

    public bool RequireLeaderColorMatch { get; set; } = true;

    public bool AllowChakraCards { get; set; }

    public bool AllowSummonCards { get; set; }

    /// <summary>
    /// Whether games created under this ruleset run the action clock at all. A "time relaxed" ruleset turns it
    /// off; a tournament ruleset can keep it on and tightened. See <c>plans/game-action-clocks.md</c>.
    /// </summary>
    public bool ClockEnabled { get; set; } = true;

    /// <summary>Seconds a player gets for one main-phase stop before it times out.</summary>
    public int MainPhaseSeconds { get; set; } = 60;

    /// <summary>Seconds a player gets for any other interactive stop (prompt, cut-in window, action step).</summary>
    public int OtherPhaseSeconds { get; set; } = 30;

    /// <summary>The player's whole-game time pool, in seconds. Running out of it loses the game.</summary>
    public int PlayerPoolSeconds { get; set; } = 1800;

    /// <summary>How many consecutive timeouts with no input forfeit the game to the opponent.</summary>
    public int TimeoutsBeforeForfeit { get; set; } = 3;

    public int SortOrder { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }

    public List<DeckRulesetCardRestriction> CardRestrictions { get; set; } = [];
}
