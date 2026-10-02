namespace ProjectHiddenVillage.Server;

/// <summary>
/// <see cref="GameActionLogEntry.ActionType"/> values that describe "this effect resolved, but there was
/// nothing for it to act on" rather than a board mutation.
///
/// The client surfaces them as a transient notice (<see cref="EffectNoticeResponse"/>), because an
/// automatically triggered effect (an "[On Summon]" chain, an attack trigger) publishes no action chip whose
/// disabled reason could tell the player why nothing happened - without a notice the effect is a silent no-op.
/// The action log stays the single source of truth (and the audit trail); nothing extra is stored on the game
/// state.
/// </summary>
public static class EffectNoticeActionTypes
{
    /// <summary>
    /// A prompted selection had no valid candidates, so its effect ran with nothing to act on (for example an
    /// "[On Summon] Summon 1 [Naruto Uzumaki] Character from your trash" while the trash holds no such card).
    /// </summary>
    public const string NoValidTargets = "effect_no_valid_targets";

    /// <summary>True when <paramref name="actionType"/> is published as an <see cref="EffectNoticeResponse"/>.</summary>
    public static bool IsNotice(string actionType)
    {
        return string.Equals(actionType, NoValidTargets, StringComparison.Ordinal);
    }
}
