namespace ProjectHiddenVillage.Server;

public sealed class EffectContextRuleSet
{
    public IReadOnlyList<EffectContextCondition> Player { get; set; } = [];

    public IReadOnlyList<EffectContextCondition> Opponent { get; set; } = [];
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
    public ZoneAmountRestriction? InZoneAmount { get; set; }

    public ZoneAmountRestriction? InZoneAmountMin { get; set; }

    public ZoneAmountRestriction? InZoneAmountMax { get; set; }
}

public sealed class ZoneAmountRestriction
{
    public int Amount { get; set; }
    public PlayerZone Zone { get; set; } = PlayerZone.Hand;
    public IReadOnlyList<string>? HasTrait { get; set; } = [];
    public IReadOnlyList<string>? HasName { get; set; } = [];
    public IReadOnlyList<string>? HasType { get; set; } = [];
    public IReadOnlyList<string>? HasColor { get; set; } = [];
}