namespace ProjectHiddenVillage.Server;

public class CanExecuteResult
{
    public bool CanExecute { get; set; } = false;
    public List<string> FailedConditions { get; set; } = [];
    public List<ValidTargetResult> ValidTargets { get; set; } = [];
}

public class ValidTargetResult
{
    public string CardName { get; set; } = string.Empty;
    public PlayerZone CardZone { get; set; }
    public string CardInstanceId { get; set; } = string.Empty;
    public string SlotId { get; set; } = string.Empty;
    public string ExecuteMessage { get; set; } = string.Empty;
}

public sealed class EffectSpec
{
    public string Id { get; set; } = string.Empty;

    public RuntimeEffects RuntimeEffectType;

    public EffectKind EffectType { get; set; } = EffectKind.Unknown;

    public EffectTiming Timing { get; set; } = EffectTiming.Unspecified;

    public EffectTargetRange TargetRange { get; set; } = EffectTargetRange.Opponent;

    public bool IsOptional { get; set; } = false;

     public int? ChakraCost { get; set; }

    public int? EffectValue { get; set; }

    public EffectRestrictions GlobalRestrictions { get; set; } = EffectRestrictions.None;

    public IReadOnlyList<EffectContextRuleSet> ContextRules { get; set; } = [];

    public EffectTargetRuleSet TargetRules { get; set; } = new();
}