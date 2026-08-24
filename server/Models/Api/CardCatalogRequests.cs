namespace ProjectHiddenVillage.Server;

public sealed record CardCatalogItemResponse(
    string Id,
    string Image,
    string OriginalId,
    bool MainAlternate,
    string? Attribute,
    IReadOnlyList<string> Name,
    string DisplayName,
    string Type,
    IReadOnlyList<string> Traits,
    string Color,
    string Description,
    int Damage,
    int Power,
    IReadOnlyList<string> Conditions,
    IReadOnlyList<CardCatalogEffectResponse> Effects,
    int? Life,
    int? Health,
    bool CannotBeNormalSummoned,
    string? SupportName,
    string? SupportEffect,
    int? SupportCost);

public sealed record CardCatalogEffectResponse(
    string Id,
    string RuntimeEffectType,
    string EffectType,
    string Timing,
    string DurationMode,
    string PassiveMode,
    CardCatalogPassiveReevaluationResponse? PassiveReevaluation,
    IReadOnlyList<CardCatalogPassiveConsequenceResponse> PassiveConsequences,
    IReadOnlyList<CardCatalogKeywordModificationResponse> KeywordModifications,
    string TargetRange,
    bool IsOptional,
    int? ChakraCost,
    string GlobalRestrictions,
    string ExecutionTargetSource,
    string ExecutionFlowMode,
    bool SuppressSummonedTargetsEffectsWhileOnField,
    CardCatalogEffectExecutionConditionResponse? ExecutionCondition,
    IReadOnlyList<CardCatalogAttributeModificationResponse> AttributeModifications,
    IReadOnlyList<CardCatalogChakraAdjustmentResponse> ChakraAdjustments,
    IReadOnlyList<CardCatalogSummonCardFlipResponse> SummonCardFlips,
    IReadOnlyList<CardCatalogEffectContextRuleSetResponse> ContextRules,
    CardCatalogEffectTargetRuleSetResponse TargetRules);

public sealed record CardCatalogPassiveReevaluationResponse(
    IReadOnlyList<string> TriggerKinds,
    string Scope);

public sealed record CardCatalogPassiveConsequenceResponse(
    string ConsequenceEffectTypeKey,
    string TargetPolicy,
    IReadOnlyDictionary<string, string> ConsequenceArguments);

public sealed record CardCatalogKeywordModificationResponse(
    string TargetType,
    string Operation,
    string Keyword);

public sealed record CardCatalogEffectExecutionConditionResponse(
    string ArgumentKey,
    string ExpectedValue,
    bool IgnoreCase,
    bool Negate);

public sealed record CardCatalogAttributeModificationResponse(
    string TargetType,
    string TargetRange,
    string Attribute,
    string Operation,
    int Value,
    int? MinimumValue,
    int? MaximumValue);

public sealed record CardCatalogChakraAdjustmentResponse(
    string TargetRange,
    string Operation,
    int Amount);

public sealed record CardCatalogSummonCardFlipResponse(
    string TargetRange,
    string FaceState);

public sealed record CardCatalogEffectContextRuleSetResponse(
    CardCatalogEffectContextConditionResponse? Player,
    CardCatalogEffectContextConditionResponse? Opponent);

public sealed record CardCatalogEffectContextConditionResponse(
    string? InZone,
    CardCatalogZoneRequirementSetResponse? InZoneRequirements);

public sealed record CardCatalogZoneRequirementSetResponse(
    IReadOnlyList<CardCatalogZoneAmountRequirementResponse> Requirements,
    string Operator,
    bool DistinctCardsAcrossRequirements);

public sealed record CardCatalogZoneAmountRequirementResponse(
    int Amount,
    string Comparison,
    CardCatalogZoneCardRestrictionResponse Restriction);

public sealed record CardCatalogEffectTargetRuleSetResponse(
    string Operator,
    int? ExactTargetCount,
    int? MinimumTargetCount,
    int? MaximumTargetCount,
    bool AutoSelectAllValidTargets,
    CardCatalogTributeTargetCompositionResponse? TributeComposition,
    IReadOnlyList<CardCatalogEffectTargetRuleResponse> Rules);

public sealed record CardCatalogEffectTargetRuleResponse(
    string Scope,
    string InZone,
    string? TributeRole,
    int? ExactSelectedTargetCount,
    int? MinimumSelectedTargetCount,
    int? MaximumSelectedTargetCount,
    CardCatalogZoneCardRestrictionResponse Restriction);

public sealed record CardCatalogZoneCardRestrictionResponse(
    IReadOnlyList<CardCatalogZoneCardPropertyPredicateResponse> Predicates,
    string MatchMode);

public sealed record CardCatalogZoneCardPropertyPredicateResponse(
    string Property,
    string Operator,
    string? Value,
    IReadOnlyList<string> Values,
    bool IgnoreCase);

public sealed record CardCatalogTributeTargetCompositionResponse(
    int? ExactTributeCount,
    int? MinimumTributeCount,
    int? MaximumTributeCount,
    bool RequireSingleSummonTarget,
    bool RequireDistinctSummonAndTributes);

public sealed record UpdateCardEffectsRequest(
    IReadOnlyList<string>? Conditions,
    IReadOnlyList<EffectSpec>? Effects,
    string? Description,
    string? SupportEffect,
    bool? CannotBeNormalSummoned = null,
    string? Type = null,
    string? Color = null,
    int? Power = null,
    int? Damage = null,
    int? Life = null,
    int? Health = null);
