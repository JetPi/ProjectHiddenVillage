namespace ProjectHiddenVillage.Server.Data.Entities;

public sealed class DeckRuleset
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string Key { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public bool IsActive { get; set; } = true;

    /// <summary>
    /// Whether quick match may pair players on this format. A host-only format stays fully playable through hosting,
    /// invites and joins; it is simply never offered by the matchmaker, which is what keeps an untimed or
    /// experimental format out of the queue without deactivating it.
    /// </summary>
    public bool AvailableInQuickMatch { get; set; } = true;

    /// <summary>
    /// Whether the card rules below restrict an otherwise open pool or define a closed one. In a closed pool only
    /// cards matched by an allowing rule may be played, which is what excludes a placeholder set without naming
    /// every placeholder.
    /// </summary>
    public CardPoolMode CardPoolMode { get; set; } = CardPoolMode.Open;

    public int LeaderCount { get; set; } = 1;

    public int NonLeaderCardCount { get; set; }

    public int MaxCopiesPerNonLeaderCard { get; set; } = 4;

    public bool RequireLeaderColorMatch { get; set; } = true;

    /// <summary>
    /// Whether games created under this ruleset run the action clock at all. A tournament ruleset keeps it on and
    /// tightens the budgets; turning it off here makes every game on the format untimed. Per-game "time relaxed"
    /// tables do not live here: that is a modifier on the hosted instance. See <c>plans/game-action-clocks.md</c>
    /// and <c>plans/time-relaxed-modifier-and-quickmatch-availability.md</c>.
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
