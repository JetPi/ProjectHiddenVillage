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
    AlterResources,
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

    public ZoneRequirementSet? InZoneRequirements { get; set; }
}

public enum ZoneAmountComparison
{
    Exact,
    Minimum,
    Maximum,
}

public enum RequirementGroupOperator
{
    All,
    Any,
}

public enum ZoneRestrictionMatchMode
{
    Any,
    All,
}

public sealed class ZoneRequirementSet
{
    public IReadOnlyList<ZoneAmountRequirement> Requirements { get; set; } = [];
    public RequirementGroupOperator Operator { get; set; } = RequirementGroupOperator.All;
    public bool DistinctCardsAcrossRequirements { get; set; } = false;
}

public sealed class ZoneAmountRequirement
{
    public int Amount { get; set; }

    public ZoneAmountComparison Comparison { get; set; } = ZoneAmountComparison.Exact;

    public ZoneCardRestriction Restriction { get; set; } = new();
}

public sealed class ZoneCardRestriction
{
    public IReadOnlyList<ZoneCardPropertyPredicate>? Predicates { get; set; } = [];
    public ZoneRestrictionMatchMode MatchMode { get; set; } = ZoneRestrictionMatchMode.Any;
}

public enum ZoneCardPredicateOperator
{
    Equals,
    NotEquals,
    GreaterThan,
    GreaterThanOrEqual,
    LessThan,
    LessThanOrEqual,
    Contains,
    In,
}

public enum ZoneCardProperty
{
    Self,
    Id,
    OriginalId,
    DisplayName,
    Name,
    Trait,
    Type,
    Color,
    Power,
    Damage,
    Health,
    CurrentHealth,
    OwnerPlayerId,
    ControllerPlayerId,
    IsExhausted,
    CannotBeNormalSummoned,
}

public sealed class ZoneCardPropertyPredicate
{
    public ZoneCardProperty Property { get; set; } = ZoneCardProperty.Type;
    public ZoneCardPredicateOperator Operator { get; set; } = ZoneCardPredicateOperator.Equals;
    public string? Value { get; set; }
    public IReadOnlyList<string>? Values { get; set; } = [];
    public bool IgnoreCase { get; set; } = true;
}
