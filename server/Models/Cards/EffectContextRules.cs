namespace ProjectHiddenVillage.Server;

public sealed class EffectContextRuleSet
{
    public EffectContextCondition? Player { get; set; }

    public EffectContextCondition? Opponent { get; set; }
}

public enum RuntimeEffects
{
    DestroyCard = 0,
    NegateEffect = 1,
    GainEffect = 2,
    ChangeValues = 3,
    AlterResources = 4,
    Tribute = 5,
    SearchCard = 8,
    FreezeCard = 9,
    RevealCard = 10,
    SummonCard = 11,
    InterruptAttack = 12,
    MoveCard = 13,
    /// <summary>
    /// Locks a player's chakra: while it lasts the affected player cannot turn their own chakra face-up,
    /// so their resource pool can only go down (N-016's "you cannot turn your CHAKRA face-up"). The
    /// affected players come from the effect's <see cref="EffectSpec.TargetRange"/>, so the node needs no
    /// selected targets. Distinct from <see cref="FreezeCard"/>, which freezes a chosen card's keyword.
    /// </summary>
    LockChakraRecovery = 14,
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

public sealed class ZoneCardRestrictionRuleSet
{
    public IReadOnlyList<ZoneCardRestriction> Restrictions { get; set; } = [];
    public RequirementGroupOperator Operator { get; set; } = RequirementGroupOperator.All;
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

/// <summary>
/// The property a stored effect predicate compares against. <c>card_catalog_entries.EffectsJson</c> serializes
/// enums as ordinals, so <b>these numbers are a storage contract</b>: a predicate written to the database keeps the
/// integer it was given, and seeding never rewrites an existing row.
/// <para>
/// The numbers are spelled out for exactly that reason. While they were implicit, removing <c>OriginalId</c> (which
/// sat at index 2) shifted every later member down by one, so rows written before that commit silently started
/// reading a different property (Name -> Trait, Power -> Damage, Type -> Color, ...). That is why N-007's
/// conditional Rush and N-011's Choji/Shikamaru condition stopped working on an existing database while a fresh one
/// was fine. Add a new member at a number above the highest one in use; never renumber or reuse an existing number.
/// </para>
/// </summary>
public enum ZoneCardProperty
{
    Self = 0,
    Id = 1,
    DisplayName = 2,
    Name = 3,
    Trait = 4,
    Type = 5,
    Color = 6,
    Power = 7,
    Damage = 8,
    Health = 9,
    CurrentHealth = 10,
    OwnerPlayerId = 11,
    ControllerPlayerId = 12,
    IsRested = 13,
    CannotBeNormalSummoned = 14,
}

public sealed class ZoneCardPropertyPredicate
{
    public ZoneCardProperty Property { get; set; } = ZoneCardProperty.Type;
    public ZoneCardPredicateOperator Operator { get; set; } = ZoneCardPredicateOperator.Equals;
    public string? Value { get; set; }
    public IReadOnlyList<string>? Values { get; set; } = [];
    public bool IgnoreCase { get; set; } = true;
}
