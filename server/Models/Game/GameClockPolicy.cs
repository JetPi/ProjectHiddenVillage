namespace ProjectHiddenVillage.Server;

/// <summary>
/// The action-clock rules a game plays under, snapshotted onto the instance when it is created so a later
/// ruleset edit can never change a running game (see <c>plans/game-action-clocks.md</c>).
///
/// The clock has three budgets: one per main-phase stop, one per any other interactive stop, and one pool for
/// the whole game per player. The pool is what caps a game's length; the per-stop budgets are what stop a
/// player from stalling inside a single stop.
/// </summary>
public sealed record GameClockPolicy(
    bool Enabled,
    TimeSpan MainPhaseBudget,
    TimeSpan OtherPhaseBudget,
    TimeSpan PlayerPoolBudget,
    int TimeoutsBeforeForfeit,
    bool RefreshOnAction)
{
    /// <summary>The default policy: a minute a main phase, 30 seconds any other stop, 30 minutes a player.</summary>
    public static GameClockPolicy Standard { get; } = new(
        Enabled: true,
        MainPhaseBudget: TimeSpan.FromSeconds(60),
        OtherPhaseBudget: TimeSpan.FromSeconds(30),
        PlayerPoolBudget: TimeSpan.FromMinutes(30),
        TimeoutsBeforeForfeit: 3,
        RefreshOnAction: true);

    /// <summary>
    /// The untimed policy: nothing is ever armed or published. A "time relaxed" table reaches this by applying the
    /// host's modifier on top of whatever policy its ruleset binds (see <see cref="GameModifierKeys.TimeRelaxed"/>),
    /// so no ruleset has to exist just to switch the clock off.
    /// </summary>
    public static GameClockPolicy Untimed { get; } = Standard with { Enabled = false };

    /// <summary>Turns the clock off, keeping every other timing value for the clients that still read them.</summary>
    public GameClockPolicy WithoutClock() => this with { Enabled = false };

    /// <summary>
    /// The budget of one stop. <paramref name="isMainPhase"/> is true only for a main phase the active player
    /// owns; every prompt, cut-in window and action step takes the shorter budget.
    /// </summary>
    public TimeSpan BudgetFor(bool isMainPhase)
    {
        return isMainPhase ? MainPhaseBudget : OtherPhaseBudget;
    }

    /// <summary>
    /// Builds a policy from the persisted ruleset columns, clamping each value to something a clock can actually
    /// run with. The service validates the ranges before saving, so the clamp is a last line of defence for rows
    /// written outside it (seed data, manual SQL).
    /// </summary>
    public static GameClockPolicy FromSeconds(
        bool enabled,
        int mainPhaseSeconds,
        int otherPhaseSeconds,
        int playerPoolSeconds,
        int timeoutsBeforeForfeit,
        bool refreshOnAction = true)
    {
        return new GameClockPolicy(
            Enabled: enabled,
            MainPhaseBudget: TimeSpan.FromSeconds(Math.Max(mainPhaseSeconds, 1)),
            OtherPhaseBudget: TimeSpan.FromSeconds(Math.Max(otherPhaseSeconds, 1)),
            PlayerPoolBudget: TimeSpan.FromSeconds(Math.Max(playerPoolSeconds, 1)),
            TimeoutsBeforeForfeit: Math.Max(timeoutsBeforeForfeit, 1),
            RefreshOnAction: refreshOnAction);
    }
}
