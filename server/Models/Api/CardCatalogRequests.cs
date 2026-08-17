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
    IReadOnlyList<CardCatalogConditionResponse> Conditions,
    IReadOnlyList<CardCatalogEffectResponse> Effects,
    int? Life,
    int? Health,
    string? SupportName,
    string? SupportEffect,
    int? SupportCost);

public sealed record CardCatalogConditionResponse(
    string Id,
    IReadOnlyDictionary<string, string> Args);

public sealed record CardCatalogEffectResponse(
    string Id,
    string EffectType,
    string Timing,
    string TargetRange,
    bool IsOptional,
    int? ChakraCost,
    string GlobalRestrictions,
    IReadOnlyList<EffectContextRuleSet> ContextRules);

public sealed record UpdateCardEffectsRequest(
    IReadOnlyList<ConditionSpec>? Conditions,
    IReadOnlyList<EffectSpec>? Effects,
    string? Description,
    string? SupportEffect);
