namespace ProjectHiddenVillage.Server;

public enum CardType
{
    Leader,
    Character,
    ExCharacter
}

public enum CardColor
{
    Red,
    Blue,
    Green
}

public enum EffectKind
{
    Unknown,
    FlipCardDown
}

public enum EffectTiming
{
    Unspecified,
    ActivateMain
}

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
        WhenAttacking
    };
}