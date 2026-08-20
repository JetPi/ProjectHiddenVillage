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
    Support,
    Recovery,
    SummonRequirement,
    Rush,
    Activated,
}

public enum EffectRestrictions
{
    None,
    OncePerTurn
}

public enum EffectTargetRange
{
    Self,
    Opponent,
    Any,
}

public enum EffectTiming
{
    Unspecified,
    ActivateMain,
    DuringOpponentAttack,
    SupportActivated,
    Quick,
    OnSummon,
    DuringYourMain,
    YourTurn,
    WhenAttacking,
}