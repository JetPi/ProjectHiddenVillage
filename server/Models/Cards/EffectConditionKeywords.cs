namespace ProjectHiddenVillage.Server;

public static class EffectConditionKeywords
{
    public const string ActivateMain = "Activate: Main";
    public const string Recovery = "Recovery";
    public const string NamedCardReference = "Named Card Reference";
    public const string DuringOpponentAttack = "During Your Opponent's Attack";
    public const string Support = "Support";
    public const string Quick = "Quick";
    public const string Rush = "Rush";
    public const string SummonRequirements = "Summon Requirements";
    public const string OnSummon = "On Summon";
    public const string DuringYourMain = "During Your Main";
    public const string YourTurn = "Your Turn";
    public const string SupportActivated = "Support Activated";
    public const string OncePerTurn = "Once Per Turn";
    public const string WhenAttacking = "When Attacking";
    public const string NotAffectedByOpponentSupportEffects = "Not Affected By Opponent Support Effects";

    public static readonly string[] All =
    {
        ActivateMain,
        Recovery,
        DuringOpponentAttack,
        Support,
        Quick,
        Rush,
        SummonRequirements,
        OnSummon,
        DuringYourMain,
        YourTurn,
        SupportActivated,
        OncePerTurn,
        WhenAttacking,
        NotAffectedByOpponentSupportEffects
    };
}

/// <summary>
/// Player-facing reasons surfaced when an effect is blocked by a
/// <see cref="EffectRestrictions"/> restriction.
/// </summary>
public static class EffectRestrictionMessages
{
    public const string OncePerTurn = "This effect can only be used once per turn.";

    /// <summary>
    /// A node that is not an independently activatable ability (see
    /// <c>CardAbilityTimingRules.IsIndependentlyActivatableAbility</c>): a chain step of another ability, a
    /// passive the engine resolves on its own, the card's summon requirement, or a support effect (which is
    /// activated through the support path - from the hand or the support area - never as a card's ability).
    /// </summary>
    public const string NotAnActivatedAbility = "This effect is not an ability you can activate.";

    /// <summary>A support card cannot be activated twice inside the same reaction chain.</summary>
    public const string AlreadyActivatedInChain = "This support is already part of the current chain.";
}
