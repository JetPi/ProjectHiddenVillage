namespace ProjectHiddenVillage.Server;

public sealed class EffectContextRuleSet
{
    public EffectContextCondition? Player { get; set; }

    public EffectContextCondition? Opponent { get; set; }
}

public enum RuntimeEffects
{
    DestroyCard,
    NegateEffect,
    GainEffect,
    ChangeValues,
    Tribute,
    SummonSelf,
    MoveCard,
    SearchCard,
    FreezeCard,
    RevealCard,
    SummonCard,
}

public sealed class EffectContextCondition
{
    public PlayerZone? InZone { get; set; }
    public ZoneAmountRestriction? InZoneAmount { get; set; }

    public ZoneAmountRestriction? InZoneAmountMin { get; set; }

    public ZoneAmountRestriction? InZoneAmountMax { get; set; }
}

public sealed class ZoneAmountRestriction
{
    public int Amount { get; set; }
    public IReadOnlyList<string>? HasTrait { get; set; } = [];
    public IReadOnlyList<string>? HasName { get; set; } = [];
    public IReadOnlyList<CardType>? HasType { get; set; } = [];
    public IReadOnlyList<CardColor>? HasColor { get; set; } = [];
}