namespace ProjectHiddenVillage.Server;

public sealed class EffectTargetRuleSet
{
    public RequirementGroupOperator Operator { get; set; } = RequirementGroupOperator.Any;

    public int? ExactTargetCount { get; set; }

    public int? MinimumTargetCount { get; set; }

    public int? MaximumTargetCount { get; set; }

    public bool AutoSelectAllValidTargets { get; set; }

    public TributeTargetComposition? TributeComposition { get; set; }

    public IReadOnlyList<EffectTargetRule> Rules { get; set; } = [];
}

public sealed class EffectTargetRule
{
    public EffectTargetRange Scope { get; set; } = EffectTargetRange.Opponent;

    public PlayerZone InZone { get; set; } = PlayerZone.CharacterField;

    public EffectTargetLocationSelector LocationSelector { get; set; } = new();

    public TributeTargetRole? TributeRole { get; set; }

    public int? ExactSelectedTargetCount { get; set; }

    public int? MinimumSelectedTargetCount { get; set; }

    public int? MaximumSelectedTargetCount { get; set; }

    public ZoneCardRestriction Restriction { get; set; } = new();
}

public sealed class EffectTargetLocationSelector
{
    public EffectTargetLocationSelectorKind Kind { get; set; } = EffectTargetLocationSelectorKind.Any;

    public int? SupportSlotIndex { get; set; }
}

public enum EffectTargetLocationSelectorKind
{
    Any,
    SupportSlotIndex,
    DeckTop,
}

public sealed class TributeTargetComposition
{
    public int? ExactTributeCount { get; set; }
    public int? MinimumTributeCount { get; set; }
    public int? MaximumTributeCount { get; set; }
    public bool RequireSingleSummonTarget { get; set; } = true;
    public bool RequireDistinctSummonAndTributes { get; set; } = true;
}
