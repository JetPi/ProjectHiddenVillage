namespace ProjectHiddenVillage.Server;

public enum AppliedCardModifierKind
{
    Attribute,
    Keyword,
    FaceStateLock,
}

public sealed class AppliedCardEffectState
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    public string SourceCardInstanceId { get; set; } = string.Empty;

    public string EffectSpecId { get; set; } = string.Empty;

    public string TargetCardInstanceId { get; set; } = string.Empty;

    public AppliedCardModifierKind ModifierKind { get; set; }

    public EffectDurationMode DurationMode { get; set; } = EffectDurationMode.Instant;

    public EffectAttributeType? AttributeType { get; set; }

    public AttributeModificationOperation? AttributeOperation { get; set; }

    public int? AttributeValue { get; set; }

    public int? AttributeMinimumValue { get; set; }

    public int? AttributeMaximumValue { get; set; }

    public KeywordModificationOperation? KeywordOperation { get; set; }

    public string? Keyword { get; set; }

    public FaceStateTargetCategory? FaceStateTargetCategory { get; set; }

    public FaceStateLockOperation? FaceStateLockOperation { get; set; }

    public string? TargetPlayerId { get; set; }

    public string AppliedByPlayerId { get; set; } = string.Empty;

    public int AppliedTurnNumber { get; set; }
}
