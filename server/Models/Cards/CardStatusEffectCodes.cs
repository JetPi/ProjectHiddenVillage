namespace ProjectHiddenVillage.Server;

/// <summary>
/// Machine-readable statuses a card can be under right now, published per card in the game state so the
/// board can badge it. The strings are contract values (the client maps them to icons and wording), so
/// never localise them here.
/// </summary>
public static class CardStatusEffectCodes
{
    /// <summary>The card may attack on the turn it entered the field (printed, granted, or temporary).</summary>
    public const string Rush = "Rush";

    /// <summary>
    /// The card cannot declare battle right now - either it carries the "Cannot Attack" keyword (N-013's
    /// freeze) or one of the live battle restrictions applies (first turn, rested, summoned this turn). The
    /// published status also carries a reason code and text, because the opponent's board has no action
    /// options to read the restriction from.
    /// </summary>
    public const string CannotAttack = "CannotAttack";

    /// <summary>The card cannot be targeted by the opponent's support effects.</summary>
    public const string ImmuneToOpponentSupportEffects = "ImmuneToOpponentSupportEffects";

    /// <summary>
    /// The card's own effects (printed ones included) are negated for as long as it stays on the field.
    /// </summary>
    public const string EffectsSuppressed = "EffectsSuppressed";

    public static readonly string[] All =
    {
        Rush,
        CannotAttack,
        ImmuneToOpponentSupportEffects,
        EffectsSuppressed
    };
}
