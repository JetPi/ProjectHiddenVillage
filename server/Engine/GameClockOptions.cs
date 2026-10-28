namespace ProjectHiddenVillage.Server.Engine;

/// <summary>
/// The deployment-wide defaults for the action clock (see <c>plans/game-action-clocks.md</c>).
///
/// A game's clock policy comes from the ruleset it was created under; these values are what an unbound game
/// (created without a ruleset) snaps up, so a plain invite still cannot stall forever. <see cref="Enabled"/> is
/// the kill switch for the whole feature: with it off no game arms a clock, whatever its ruleset says, which is
/// what makes the rollout - and a rollback - one configuration value.
/// </summary>
public sealed class GameClockOptions
{
    public const string SectionName = "GameClock";

    /// <summary>False turns the clock off for every game, ignoring the ruleset's own setting.</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>A main-phase stop's budget, in seconds.</summary>
    public int MainPhaseSeconds { get; set; } = 60;

    /// <summary>Every other interactive stop's budget, in seconds.</summary>
    public int OtherPhaseSeconds { get; set; } = 30;

    /// <summary>The per-player pool for a whole game, in seconds.</summary>
    public int PlayerPoolSeconds { get; set; } = 1_800;

    /// <summary>Consecutive timeouts that forfeit the game to the opponent.</summary>
    public int TimeoutsBeforeForfeit { get; set; } = 3;

    /// <summary>Whether a player's own action refreshes their current stop to its full budget.</summary>
    public bool RefreshOnAction { get; set; } = true;

    /// <summary>The policy an unbound game runs under.</summary>
    public GameClockPolicy DefaultPolicy =>
        GameClockPolicy.FromSeconds(
            enabled: Enabled,
            mainPhaseSeconds: MainPhaseSeconds,
            otherPhaseSeconds: OtherPhaseSeconds,
            playerPoolSeconds: PlayerPoolSeconds,
            timeoutsBeforeForfeit: TimeoutsBeforeForfeit,
            refreshOnAction: RefreshOnAction);

    /// <summary>
    /// Applies the deployment kill switch to a ruleset's policy. Everything else is the ruleset's decision: this
    /// type only owns the "is the clock running at all" bit, so a deployment cannot silently retune a format.
    /// </summary>
    public GameClockPolicy Apply(GameClockPolicy rulesetPolicy)
    {
        ArgumentNullException.ThrowIfNull(rulesetPolicy);

        return rulesetPolicy with { Enabled = Enabled && rulesetPolicy.Enabled };
    }
}
