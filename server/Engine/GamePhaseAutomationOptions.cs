namespace ProjectHiddenVillage.Server.Engine;

/// <summary>
/// How the engine's phase automation behaves (see <c>plans/server-owned-phase-transitions.md</c>).
///
/// <see cref="Enabled"/> is the single switch for the whole feature: with it off the engine never advances a
/// non-interactive phase on its own, which is exactly the behaviour before the presentation contract existed
/// (the client drove those phases). That is what makes the rollout - and a rollback - one configuration value.
/// </summary>
public sealed class GamePhaseAutomationOptions
{
    public const string SectionName = "GamePhaseAutomation";

    /// <summary>
    /// True once the engine owns the non-interactive phases: it drains them itself and stops on the ones a
    /// client has to present, waiting for <c>AcknowledgePhasePresentation</c>.
    /// </summary>
    public bool Enabled { get; set; }

    /// <summary>
    /// How long the engine waits for the required acknowledgements before it resumes on its own. This is the
    /// safety net that keeps a hung, reloading or disconnected client from stranding a game: the transition is
    /// already on screen, so a late acknowledgement is ignored rather than replayed. Zero or negative disables
    /// the watchdog (tests, and any deployment that wants acknowledgements to be mandatory).
    /// </summary>
    public int PresentationAckTimeoutMs { get; set; } = 4_000;

    /// <summary>
    /// Upper bound on the phases one drain may walk through. A non-interactive phase loop that never reaches an
    /// interactive phase is a bug in the phase graph, and this turns it into a logged stop instead of a lock
    /// held forever.
    /// </summary>
    public int MaxDrainSteps { get; set; } = 16;
}
