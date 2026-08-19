namespace ProjectHiddenVillage.Server;

public enum TargetPlayerScope
{
    Player,
    Opponent,
    Any,
}

public sealed class EffectTargetRuleSet
{
    public RequirementGroupOperator Operator { get; set; } = RequirementGroupOperator.Any;

    public IReadOnlyList<EffectTargetRule> Rules { get; set; } = [];
}

public sealed class EffectTargetRule
{
    public TargetPlayerScope Scope { get; set; } = TargetPlayerScope.Opponent;

    public PlayerZone InZone { get; set; } = PlayerZone.CharacterField;

    public ZoneCardRestriction Restriction { get; set; } = new();
}
