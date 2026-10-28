using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server;

/// <summary>
/// Who may read an entry of the game's action log.
///
/// The log is the engine's audit trail first and a player-facing feed second, so the two are not the same list.
/// An entry that only the acting player could have known about must not travel to the opponent: a support card is
/// placed face down and is only flipped when it is activated, so an entry naming a freshly set support would hand
/// the opponent the board. <see cref="OwnerOnly"/> is how the engine says "recorded, but not for everyone".
/// </summary>
public enum GameActionLogVisibility
{
    /// <summary>Both players may read the entry.</summary>
    Public = 0,

    /// <summary>Only the player this entry is attributed to may read it.</summary>
    OwnerOnly = 1,
}

/// <summary>What kind of thing an entry describes, so the client can group the log instead of showing one flat list.</summary>
public enum GameActionLogCategory
{
    Lifecycle = 0,
    Phase = 1,
    Prompt = 2,
    Action = 3,
    Effect = 4,
    Clock = 5,
    Outcome = 6,
}

/// <summary>
/// The action-type vocabulary the engine logs with.
///
/// These are the values <see cref="GameActionLogPublishing.IsPublished"/> reasons about and the client switches on
/// to build a sentence, so a type is either declared here or it reaches the client as a raw server message.
/// </summary>
public static class GameActionLogActionTypes
{
    // Lifecycle: the table coming into existence and the participants joining it.
    public const string GameCreated = "game_created";
    public const string PlayerJoined = "player_joined";
    public const string StartingPlayerAssigned = "starting_player_assigned";
    public const string StartingPlayerPrompted = "starting_player_prompted";

    // Phase and turn plumbing.
    public const string TurnStarted = "turn_started";
    public const string PhaseStarted = "phase_started";
    public const string ActionStepActionDeclared = "action_step_action_declared";
    public const string ActionStepPassDeclared = "action_step_pass_declared";
    public const string SupportWindowPassDeclared = "support_window_pass_declared";
    public const string EndStepDeclared = "end_step_declared";

    // Prompts the players answer.
    public const string PromptResolved = "prompt_resolved";
    public const string MulliganPrompted = "mulligan_prompted";

    /// <summary>
    /// A card was shown and acknowledged. A reveal is modelled as a prompt whose only answer is "continue", and the
    /// client acknowledges it on its own, so it must not be reported as a choice somebody made.
    /// </summary>
    public const string RevealPresented = "reveal_presented";

    // Things a player did with their board. These are the entries the log panel exists for.
    public const string CardSummoned = "card_summoned";
    public const string CardSummonedWithRequirement = "card_summoned_with_requirement";
    public const string SupportSet = "support_set";
    public const string SupportActivated = "support_activated";
    public const string AttackDeclared = "attack_declared";
    public const string LeaderAbilityUsed = "leader_ability_used";
    public const string CharacterAbilityUsed = "character_ability_used";
    public const string OptionalAttackEffectAnswered = "optional_attack_effect_answered";

    // Resolution trouble worth telling the players about: an attack that was stopped, supports that never ran.
    public const string AttackInterrupted = "attack_interrupted";
    public const string SupportActivationSkipped = "support_activation_skipped";
    public const string SupportActivationFailed = "support_activation_failed";

    // Clocks and the end.
    public const string ClockTimedOut = "clock_timed_out";
    public const string GameEnded = GameEndRules.GameEndedActionType;
}

/// <summary>
/// Decides which entries of a game's action log are published to clients.
///
/// This is deliberately an allow-list. The log already carries entries that exist to explain the engine to itself -
/// a skipped mandatory effect with a raw card instance id, a presentation acknowledgement, a phase-automation
/// budget exhaustion - and those are noise (or worse) in a panel meant to read like a game record. A new entry is
/// therefore private until it is added here, which is the safe default for a log that is also an information
/// boundary.
/// </summary>
public static class GameActionLogPublishing
{
    /// <summary>
    /// How many entries the response carries. The log itself is append-only and unbounded for the life of a game;
    /// the client republishes nothing and re-reads this tail on every push, so it has to stay a bounded tail
    /// rather than the whole history.
    /// </summary>
    public const int MaxPublishedEntries = 120;

    private static readonly HashSet<string> PublishedActionTypes = new(StringComparer.Ordinal)
    {
        // Lifecycle.
        GameActionLogActionTypes.GameCreated,
        GameActionLogActionTypes.PlayerJoined,
        GameActionLogActionTypes.StartingPlayerAssigned,
        GameActionLogActionTypes.StartingPlayerPrompted,

        // Turn and phase plumbing that a player can see happening on the board.
        GameActionLogActionTypes.TurnStarted,
        GameActionLogActionTypes.PhaseStarted,
        GameActionLogActionTypes.ActionStepActionDeclared,
        GameActionLogActionTypes.ActionStepPassDeclared,
        GameActionLogActionTypes.SupportWindowPassDeclared,
        GameActionLogActionTypes.EndStepDeclared,

        // Prompts.
        GameActionLogActionTypes.PromptResolved,
        GameActionLogActionTypes.MulliganPrompted,
        GameActionLogActionTypes.RevealPresented,

        // Player actions.
        GameActionLogActionTypes.CardSummoned,
        GameActionLogActionTypes.CardSummonedWithRequirement,
        GameActionLogActionTypes.SupportSet,
        GameActionLogActionTypes.SupportActivated,
        GameActionLogActionTypes.AttackDeclared,
        GameActionLogActionTypes.LeaderAbilityUsed,
        GameActionLogActionTypes.CharacterAbilityUsed,
        GameActionLogActionTypes.OptionalAttackEffectAnswered,

        // Resolution trouble.
        GameActionLogActionTypes.AttackInterrupted,
        GameActionLogActionTypes.SupportActivationSkipped,
        GameActionLogActionTypes.SupportActivationFailed,

        // Clock and outcome.
        GameActionLogActionTypes.ClockTimedOut,
        GameActionLogActionTypes.GameEnded,
    };

    /// <summary>
    /// True when <paramref name="actionType"/> belongs in the player-facing log. Engine diagnostics
    /// (effect-skip capture, presentation acknowledgements, phase-automation budget exhaustion) are not listed
    /// and stay in the audit trail only.
    /// </summary>
    public static bool IsPublished(string actionType)
    {
        return !string.IsNullOrWhiteSpace(actionType) && PublishedActionTypes.Contains(actionType);
    }

    /// <summary>
    /// True when the entry may be shown to <paramref name="requestingPlayerId"/>. A public entry is shown to
    /// everyone; an owner-only entry only to the player it is attributed to, and never to a player it cannot be
    /// attributed to at all.
    /// </summary>
    public static bool IsVisibleTo(GameActionLogEntry entry, string requestingPlayerId)
    {
        ArgumentNullException.ThrowIfNull(entry);

        if (!IsPublished(entry.ActionType))
        {
            return false;
        }

        if (entry.Visibility == GameActionLogVisibility.Public)
        {
            return true;
        }

        if (string.IsNullOrWhiteSpace(entry.PlayerId) || string.IsNullOrWhiteSpace(requestingPlayerId))
        {
            return false;
        }

        return string.Equals(entry.PlayerId.Trim(), requestingPlayerId.Trim(), StringComparison.OrdinalIgnoreCase);
    }
}
