namespace ProjectHiddenVillage.Server;

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

public enum AttributeModificationTargetType
{
    SelectedTargets,
    Leader
}

public enum AttributeModificationOperation
{
    Add,
    Subtract,
    Multiply,
    Set
}

public enum EffectAttributeType
{
    CardPower,
    CardHealth,
    CardDamage,
    LeaderPower,
    LeaderDamage,
    LeaderCurrentLife
}

public enum KeywordModificationTargetType
{
    SourceCard,
    SelectedTargets
}

public enum KeywordModificationOperation
{
    Add,
    Remove
}

public enum PassiveMode
{
    None,
    Continuous,
    Triggered
}

public enum PassiveTriggerKind
{
    StatsChanged,
    ZoneChanged,
    TurnChanged,
    PhaseChanged,
    StackResolved,
    Any
}

public enum PassiveReevaluationScope
{
    SourceCardOnly,
    SourceController,
    WholeGame
}

public enum PassiveConsequenceTargetPolicy
{
    SourceCard,
    TriggerSelectedTargets
}

public enum ChakraAdjustmentOperation
{
    Pay,
    Recover,
}

public enum EffectExecutionTargetSource
{
    SelectedTargets,
    SourceCard,
    None,
}

public enum EffectExecutionFlowMode
{
    PerStep,
    AtomicChain,
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


public sealed class PassiveReevaluationSpec
{
    public IReadOnlyList<PassiveTriggerKind> TriggerKinds { get; set; } = [PassiveTriggerKind.Any];

    public PassiveReevaluationScope Scope { get; set; } = PassiveReevaluationScope.SourceCardOnly;
}

public sealed class PassiveConsequenceSpec
{
    public string ConsequenceEffectTypeKey { get; set; } = string.Empty;

    public PassiveConsequenceTargetPolicy TargetPolicy { get; set; } = PassiveConsequenceTargetPolicy.SourceCard;

    public IReadOnlyDictionary<string, string> ConsequenceArguments { get; set; } =
        new Dictionary<string, string>(StringComparer.Ordinal);
}

public sealed class KeywordModificationSpec
{
    public KeywordModificationTargetType TargetType { get; set; } = KeywordModificationTargetType.SourceCard;

    public KeywordModificationOperation Operation { get; set; } = KeywordModificationOperation.Add;

    public string Keyword { get; set; } = string.Empty;
}

public sealed class AttributeModificationSpec
{
    public AttributeModificationTargetType TargetType { get; set; } = AttributeModificationTargetType.SelectedTargets;

    public EffectTargetRange TargetRange { get; set; } = EffectTargetRange.Self;

    public EffectAttributeType Attribute { get; set; } = EffectAttributeType.CardPower;

    public AttributeModificationOperation Operation { get; set; } = AttributeModificationOperation.Add;

    public int Value { get; set; }

    public int? MinimumValue { get; set; }

    public int? MaximumValue { get; set; }
}

public sealed class ChakraAdjustmentSpec
{
    public EffectTargetRange TargetRange { get; set; } = EffectTargetRange.Self;

    public ChakraAdjustmentOperation Operation { get; set; } = ChakraAdjustmentOperation.Pay;

    public int Amount { get; set; }
}

public sealed class SummonCardFlipSpec
{
    public EffectTargetRange TargetRange { get; set; } = EffectTargetRange.Self;

    public SummonCardFaceState FaceState { get; set; } = SummonCardFaceState.FaceUp;
}

public sealed class EffectExecutionConditionSpec
{
    public string ArgumentKey { get; set; } = string.Empty;

    public string ExpectedValue { get; set; } = string.Empty;

    public bool IgnoreCase { get; set; } = true;

    public bool Negate { get; set; } = false;
}

public sealed class EffectSpec
{
    public string Id { get; set; } = string.Empty;

    public RuntimeEffects RuntimeEffectType { get; set; }

    public EffectKind EffectType { get; set; } = EffectKind.Unknown;

    public EffectTiming Timing { get; set; } = EffectTiming.Unspecified;

    public EffectTargetRange TargetRange { get; set; } = EffectTargetRange.Opponent;

    public bool IsOptional { get; set; } = false;

     public int? ChakraCost { get; set; }

    public int? EffectValue { get; set; }

    public EffectRestrictions GlobalRestrictions { get; set; } = EffectRestrictions.None;

    public PassiveMode PassiveMode { get; set; } = PassiveMode.None;

    public EffectExecutionTargetSource ExecutionTargetSource { get; set; } = EffectExecutionTargetSource.SelectedTargets;

    public EffectExecutionFlowMode ExecutionFlowMode { get; set; } = EffectExecutionFlowMode.PerStep;

    public EffectExecutionConditionSpec? ExecutionCondition { get; set; }

    public string? OnSuccessEffectId { get; set; }

    public string? OnFailureEffectId { get; set; }

    public PassiveReevaluationSpec? PassiveReevaluation { get; set; }

    public IReadOnlyList<PassiveConsequenceSpec> PassiveConsequences { get; set; } = [];

    public IReadOnlyList<AttributeModificationSpec> AttributeModifications { get; set; } = [];

    public IReadOnlyList<ChakraAdjustmentSpec> ChakraAdjustments { get; set; } = [];

    public IReadOnlyList<SummonCardFlipSpec> SummonCardFlips { get; set; } = [];

    public bool SuppressSummonedTargetsEffectsWhileOnField { get; set; }

    public IReadOnlyList<KeywordModificationSpec> KeywordModifications { get; set; } = [];

    public IReadOnlyList<EffectContextRuleSet> ContextRules { get; set; } = [];

    public EffectTargetRuleSet TargetRules { get; set; } = new();
}