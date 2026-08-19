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
    string? SupportName,
    string? SupportEffect,
    int? SupportCost);

public sealed record CardCatalogEffectResponse(
    string Id,
    string EffectType,
    string Timing,
    string TargetRange,
    bool IsOptional,
    int? ChakraCost,
    string GlobalRestrictions,
    IReadOnlyList<CardCatalogAttributeModificationResponse> AttributeModifications,
    IReadOnlyList<CardCatalogEffectContextRuleSetResponse> ContextRules,
    CardCatalogEffectTargetRuleSetResponse TargetRules);

public sealed record CardCatalogAttributeModificationResponse(
    string TargetType,
    string TargetPlayerScope,
    string Attribute,
    string Operation,
    int Value,
    int? MinimumValue,
    int? MaximumValue);

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
    IReadOnlyList<CardCatalogEffectTargetRuleResponse> Rules);

public sealed record CardCatalogEffectTargetRuleResponse(
    string Scope,
    string InZone,
    CardCatalogZoneCardRestrictionResponse Restriction);

public sealed record CardCatalogZoneCardRestrictionResponse(
    IReadOnlyList<string> HasTrait,
    IReadOnlyList<string> HasName,
    IReadOnlyList<string> HasType,
    IReadOnlyList<string> HasColor,
    string MatchMode);

public sealed record UpdateCardEffectsRequest(
    IReadOnlyList<string>? Conditions,
    IReadOnlyList<EffectSpec>? Effects,
    string? Description,
    string? SupportEffect);
