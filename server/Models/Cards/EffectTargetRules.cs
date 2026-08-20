namespace ProjectHiddenVillage.Server;

public sealed class EffectTargetRuleSet
{
    public RequirementGroupOperator Operator { get; set; } = RequirementGroupOperator.Any;

    public int? ExactTargetCount { get; set; }

    public int? MinimumTargetCount { get; set; }

    public int? MaximumTargetCount { get; set; }

    public IReadOnlyList<EffectTargetRule> Rules { get; set; } = [];
}

public sealed class EffectTargetRule
{
    public EffectTargetRange Scope { get; set; } = EffectTargetRange.Opponent;

    public PlayerZone InZone { get; set; } = PlayerZone.CharacterField;

    public ZoneCardRestriction Restriction { get; set; } = new();
}
