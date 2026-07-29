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