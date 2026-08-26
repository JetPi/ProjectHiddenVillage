using System.Text;
using System.Text.Json;
using ErrorOr;
using Microsoft.EntityFrameworkCore;
using ProjectHiddenVillage.Server.Api.Serialization;
using ProjectHiddenVillage.Server.Api.Interfaces.Card;
using ProjectHiddenVillage.Server.Data;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server;

public sealed class CardMappingService : ICardMappingService
{
    private static readonly JsonSerializerOptions SerializerOptions = CreateSerializerOptions();
    private static readonly HashSet<string> AllowedCatalogSortFields =
    [
        "cardId",
        "displayName",
        "type",
        "color",
        "power",
        "damage",
        "createdAtUtc",
        "updatedAtUtc"
    ];

    private readonly ApplicationDbContext dbContext;

    public CardMappingService(ApplicationDbContext dbContext)
    {
        this.dbContext = dbContext;
    }

    private static JsonSerializerOptions CreateSerializerOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        options.Converters.Add(new FlexibleEnumJsonConverterFactory());
        return options;
    }

    public async Task<ErrorOr<List<Card>>> MapCards(IReadOnlyList<CardDataSourceRecord> sourceCards)
    {
        if (sourceCards.Count == 0)
        {
            return Error.Validation(
                code: "Card.Map.Empty",
                description: "At least one card payload is required.");
        }

        for (var index = 0; index < sourceCards.Count; index++)
        {
            if (string.IsNullOrWhiteSpace(sourceCards[index].CardNo))
            {
                return Error.Validation(
                    code: "Card.Map.MissingCardNo",
                    description: $"Card payload at index {index} is missing 'cardno'.");
            }
        }

        var mappedCards = sourceCards.Select(CardDataSourceMapper.ToCard).ToList();
        var mappedById = mappedCards
            .ToDictionary(card => card.Id, StringComparer.OrdinalIgnoreCase);

        var existingByCardId = await dbContext.CardCatalogEntries
            .Where(record => mappedById.Keys.Contains(record.CardId))
            .ToDictionaryAsync(record => record.CardId, StringComparer.OrdinalIgnoreCase);

        for (var index = 0; index < sourceCards.Count; index++)
        {
            var source = sourceCards[index];
            var mapped = mappedCards[index];

            if (existingByCardId.TryGetValue(mapped.Id, out var existing))
            {
                ApplySelectiveUpdate(existing, mapped, source);
                existing.UpdatedAtUtc = DateTimeOffset.UtcNow;
                continue;
            }

            dbContext.CardCatalogEntries.Add(ToNewEntry(mapped));
        }

        try
        {
            await dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            return Error.Failure(
                code: "Card.Map.PersistFailed",
                description: "Mapped cards could not be persisted.");
        }

        return mappedCards;
    }

    public async Task<ErrorOr<PagedResponse<CardCatalogItemResponse>>> GetCardCatalog(
        int page = 1,
        int pageSize = 100,
        string? sort = null)
    {
        var normalizedPage = page <= 0 ? 1 : page;
        var normalizedPageSize = pageSize <= 0 ? 100 : Math.Min(pageSize, 100);

        var sortResult = ParseSort(sort);
        if (sortResult.IsError)
        {
            return sortResult.Errors;
        }

        var totalCount = await dbContext.CardCatalogEntries.CountAsync();
        var totalPages = totalCount == 0 ? 0 : (int)Math.Ceiling(totalCount / (double)normalizedPageSize);

        var orderedQuery = ApplySort(
            dbContext.CardCatalogEntries.AsNoTracking(),
            sortResult.Value.Field,
            sortResult.Value.Descending)
            .ThenBy(entry => entry.CardId);

        var entries = await orderedQuery
            .Skip((normalizedPage - 1) * normalizedPageSize)
            .Take(normalizedPageSize)
            .ToListAsync();

        var items = entries.Select(ToCatalogResponse).ToList();

        return new PagedResponse<CardCatalogItemResponse>(
            Page: normalizedPage,
            PageSize: normalizedPageSize,
            TotalCount: totalCount,
            TotalPages: totalPages,
            Items: items);
    }

    public async Task<ErrorOr<List<CardCatalogItemResponse>>> GetCardCatalogByIds(IReadOnlyList<string>? cardIds)
    {
        if (cardIds is null || cardIds.Count == 0)
        {
            return Error.Validation(
                code: "Card.CatalogByIds.Empty",
                description: "At least one card id is required.");
        }

        var normalizedIds = cardIds
            .Select(id => id?.Trim())
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Cast<string>()
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (normalizedIds.Count == 0)
        {
            return Error.Validation(
                code: "Card.CatalogByIds.Empty",
                description: "At least one card id is required.");
        }

        var normalizedUpperIds = normalizedIds
            .Select(id => id.ToUpperInvariant())
            .ToHashSet(StringComparer.Ordinal);

        var entries = await dbContext.CardCatalogEntries
            .AsNoTracking()
            .Where(entry => normalizedUpperIds.Contains(entry.CardId.ToUpper()))
            .ToListAsync();

        var entriesById = entries.ToDictionary(entry => entry.CardId, StringComparer.OrdinalIgnoreCase);
        var orderedItems = new List<CardCatalogItemResponse>(normalizedIds.Count);

        foreach (var cardId in normalizedIds)
        {
            if (entriesById.TryGetValue(cardId, out var entry))
            {
                orderedItems.Add(ToCatalogResponse(entry));
            }
        }

        return orderedItems;
    }

    public async Task<ErrorOr<CardCatalogItemResponse>> UpdateCardEffectsByCardId(string cardId, UpdateCardEffectsRequest request)
    {
        if (request is null)
        {
            return Error.Validation(
                code: "Card.CatalogEffects.RequestRequired",
                description: "Request payload is required.");
        }

        if (string.IsNullOrWhiteSpace(cardId))
        {
            return Error.Validation(
                code: "Card.CatalogEffects.CardIdRequired",
                description: "Card id is required.");
        }

        var normalizedCardId = cardId.Trim();
        var normalizedCardIdUpper = normalizedCardId.ToUpperInvariant();

        var entry = await dbContext.CardCatalogEntries
            .SingleOrDefaultAsync(existing => existing.CardId.ToUpper() == normalizedCardIdUpper);

        if (entry is null)
        {
            return Error.NotFound(
                code: "Card.CatalogEffects.NotFound",
                description: $"Card '{normalizedCardId}' was not found.");
        }

        if (request.Conditions is not null)
        {
            entry.ConditionsJson = Serialize(request.Conditions);
        }

        if (request.Effects is not null)
        {
            entry.EffectsJson = Serialize(request.Effects);
        }

        if (request.Description is not null)
        {
            entry.Description = request.Description;
        }

        if (request.SupportEffect is not null)
        {
            entry.SupportEffect = request.SupportEffect;
        }

        if (request.CannotBeNormalSummoned.HasValue)
        {
            entry.CannotBeNormalSummoned = request.CannotBeNormalSummoned.Value;
        }

        if (request.Type is not null)
        {
            if (!TryParsePatchCardType(request.Type, out var parsedType))
            {
                return Error.Validation(
                    code: "Card.CatalogEffects.InvalidType",
                    description: $"Card type '{request.Type}' is not valid.");
            }

            entry.Type = parsedType;
        }

        if (request.Color is not null)
        {
            if (!TryParsePatchCardColor(request.Color, out var parsedColor))
            {
                return Error.Validation(
                    code: "Card.CatalogEffects.InvalidColor",
                    description: $"Card color '{request.Color}' is not valid.");
            }

            entry.Color = parsedColor;
        }

        if (request.Power.HasValue)
        {
            entry.Power = request.Power.Value;
        }

        if (request.Damage.HasValue)
        {
            entry.Damage = request.Damage.Value;
        }

        if (request.Life.HasValue)
        {
            entry.Life = request.Life.Value;
        }

        if (request.Health.HasValue)
        {
            entry.Health = request.Health.Value;
        }

        NormalizeLifeAndHealthByType(entry);

        entry.UpdatedAtUtc = DateTimeOffset.UtcNow;

        try
        {
            await dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            return Error.Failure(
                code: "Card.CatalogEffects.PersistFailed",
                description: "Card effects update could not be persisted.");
        }

        return ToCatalogResponse(entry);
    }

    private static CardCatalogEntry ToNewEntry(Card card)
    {
        var now = DateTimeOffset.UtcNow;
        var entry = new CardCatalogEntry
        {
            CardId = card.Id,
            Image = card.Image,
            OriginalId = card.OriginalId,
            MainAlternate = card.MainAlternate,
            Attribute = card.Attribute,
            DisplayName = card.DisplayName,
            Type = card.Type,
            Color = card.Color,
            Description = card.Description,
            Damage = card.Damage,
            Power = card.Power,
            NameJson = Serialize(card.Name),
            TraitsJson = Serialize(card.Traits),
            ConditionsJson = Serialize(card.Conditions),
            EffectsJson = Serialize(card.Effects),
            CannotBeNormalSummoned = card.CannotBeNormalSummoned,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        if (card is LeaderCard leader)
        {
            entry.Life = leader.Life;
        }

        if (card is CharacterCard character)
        {
            entry.Health = character.Health;
            entry.SupportName = character.SupportName;
            entry.SupportEffect = character.SupportEffect;
        }

        return entry;
    }

    private static CardCatalogItemResponse ToCatalogResponse(CardCatalogEntry entry)
    {
        var names = DeserializeOrDefault<List<string>>(entry.NameJson, []);
        var traits = DeserializeOrDefault<List<string>>(entry.TraitsJson, []);
        var conditions = DeserializeConditions(entry.ConditionsJson);
        var effects = DeserializeOrDefault<List<EffectSpec>>(entry.EffectsJson, []);
        var supportCost = ResolveSupportDisplayCost(effects);

        return new CardCatalogItemResponse(
            Id: entry.CardId,
            Image: entry.Image,
            OriginalId: entry.OriginalId,
            MainAlternate: entry.MainAlternate,
            Attribute: entry.Attribute,
            Name: names,
            DisplayName: entry.DisplayName,
            Type: ToReadableCardType(entry.Type),
            Traits: traits,
            Color: ToReadableCardColor(entry.Color),
            Description: entry.Description,
            Damage: entry.Damage,
            Power: entry.Power,
            Conditions: conditions,
            Effects: effects
                .ConvertAll(effect => new CardCatalogEffectResponse(
                    Id: effect.Id,
                    IsSubordinate: effect.IsSubordinate,
                    OnSuccessEffectId: effect.OnSuccessEffectId,
                    OnFailureEffectId: effect.OnFailureEffectId,
                    RuntimeEffectType: ToReadableRuntimeEffect(effect.RuntimeEffectType),
                    EffectType: ToReadableEffectKind(effect.EffectType),
                    Timing: ToReadableEffectTiming(effect.Timing),
                    DurationMode: ToReadableEffectDurationMode(effect.DurationMode),
                    PassiveMode: SplitPascalCase(effect.PassiveMode.ToString()),
                    PassiveReevaluation: ToPassiveReevaluationResponse(effect.PassiveReevaluation),
                    PassiveConsequences: effect.PassiveConsequences
                        .Select(ToPassiveConsequenceResponse)
                        .ToList(),
                    KeywordModifications: effect.KeywordModifications
                        .Select(ToKeywordModificationResponse)
                        .ToList(),
                    TargetRange: ToReadableEffectTargetRange(effect.TargetRange),
                    IsOptional: effect.IsOptional,
                    ChakraCost: effect.ChakraCost,
                    GlobalRestrictions: ToReadableEffectRestrictions(effect.GlobalRestrictions),
                    ExecutionTargetSource: SplitPascalCase(effect.ExecutionTargetSource.ToString()),
                    ExecutionFlowMode: SplitPascalCase(effect.ExecutionFlowMode.ToString()),
                    SuppressSummonedTargetsEffectsWhileOnField: effect.SuppressSummonedTargetsEffectsWhileOnField,
                    RevealTimingMode: SplitPascalCase(effect.RevealTimingMode.ToString()),
                    RevealPostConditionRuleSet: ToNullableZoneCardRestrictionRuleSetResponse(ResolveRevealPostConditionRuleSet(effect)),
                    RevealPostConditionRestriction: ToNullableZoneCardRestrictionResponse(ResolveRevealPostConditionRestriction(effect)),
                    RevealPostConditionPredicate: ToNullableZoneCardPropertyPredicateResponse(ResolveRevealPostConditionPredicate(effect)),
                    ExecutionCondition: ToExecutionConditionResponse(effect.ExecutionCondition),
                    AttributeModifications: effect.AttributeModifications
                        .Select(ToAttributeModificationResponse)
                        .ToList(),
                    ChakraAdjustments: effect.ChakraAdjustments
                        .Select(ToChakraAdjustmentResponse)
                        .ToList(),
                    SummonCardFlips: effect.SummonCardFlips
                        .Select(ToSummonCardFlipResponse)
                        .ToList(),
                    FaceStateLocks: effect.FaceStateLocks
                        .Select(ToFaceStateLockResponse)
                        .ToList(),
                    MoveCardActions: effect.MoveCardActions
                        .Select(ToMoveCardActionResponse)
                        .ToList(),
                    ContextRules: effect.ContextRules
                        .Select(ToContextRuleResponse)
                        .ToList(),
                    TargetRules: ToTargetRuleSetResponse(effect.TargetRules)))
,
            Life: entry.Life,
            Health: entry.Health,
            CannotBeNormalSummoned: entry.CannotBeNormalSummoned,
            SupportName: entry.SupportName,
            SupportEffect: entry.SupportEffect,
            SupportCost: supportCost);
    }

    private static int? ResolveSupportDisplayCost(IReadOnlyList<EffectSpec> effects)
    {
        return effects
            .Where(effect => effect.EffectType == EffectKind.Support && effect.ChakraCost.HasValue)
            .Select(effect => effect.ChakraCost)
            .FirstOrDefault();
    }

    private static void ApplySelectiveUpdate(CardCatalogEntry existing, Card mapped, CardDataSourceRecord source)
    {
        if (HasText(source.Image))
        {
            existing.Image = mapped.Image;
        }

        if (HasText(source.OriginalId))
        {
            existing.OriginalId = mapped.OriginalId;
        }

        if (source.MainAlternate.HasValue)
        {
            existing.MainAlternate = mapped.MainAlternate;
        }

        if (HasText(source.Attribute))
        {
            existing.Attribute = mapped.Attribute;
        }

        if (HasText(source.Name))
        {
            existing.DisplayName = mapped.DisplayName;
            existing.NameJson = Serialize(mapped.Name);
        }

        if (HasText(source.CategoryData))
        {
            existing.Type = mapped.Type;
        }

        if (HasText(source.Color))
        {
            existing.Color = mapped.Color;
        }

        if (HasText(source.Effect))
        {
            existing.Description = mapped.Description;
            existing.ConditionsJson = Serialize(mapped.Conditions);
            existing.EffectsJson = Serialize(mapped.Effects);
            existing.CannotBeNormalSummoned = mapped.CannotBeNormalSummoned;

            if (mapped is CharacterCard characterFromDescription)
            {
                existing.SupportName = characterFromDescription.SupportName;
                existing.SupportEffect = characterFromDescription.SupportEffect;
            }
        }

        if (source.Damage.HasValue)
        {
            existing.Damage = mapped.Damage;
        }

        if (HasParsableInt(source.Power))
        {
            existing.Power = mapped.Power;
        }

        if (HasText(source.Trait))
        {
            existing.TraitsJson = Serialize(mapped.Traits);
        }

        if (source.Health.HasValue)
        {
            if (existing.Type == CardType.Leader && mapped is LeaderCard leader)
            {
                existing.Life = leader.Life;
            }

            if (mapped is CharacterCard character)
            {
                existing.Health = character.Health;
            }
        }

    }

    private static bool HasText(string? value)
    {
        return !string.IsNullOrWhiteSpace(value);
    }

    private static bool HasParsableInt(string? value)
    {
        return int.TryParse(value, out _);
    }

    private static ErrorOr<CatalogSortSpec> ParseSort(string? sort)
    {
        if (string.IsNullOrWhiteSpace(sort))
        {
            return new CatalogSortSpec(Field: "cardId", Descending: false);
        }

        var normalized = sort.Trim();
        var descending = normalized.StartsWith("-", StringComparison.Ordinal);
        var field = descending ? normalized[1..] : normalized;
        field = field.Trim();

        if (!AllowedCatalogSortFields.Contains(field))
        {
            return Error.Validation(
                code: "Card.Catalog.InvalidSort",
                description: "Unsupported sort field. Use one of: cardId, displayName, type, color, power, damage, createdAtUtc, updatedAtUtc. Prefix with '-' for descending order.");
        }

        return new CatalogSortSpec(Field: field, Descending: descending);
    }

    private static IOrderedQueryable<CardCatalogEntry> ApplySort(
        IQueryable<CardCatalogEntry> query,
        string field,
        bool descending)
    {
        return (field, descending) switch
        {
            ("cardId", false) => query.OrderBy(entry => entry.CardId),
            ("cardId", true) => query.OrderByDescending(entry => entry.CardId),
            ("displayName", false) => query.OrderBy(entry => entry.DisplayName),
            ("displayName", true) => query.OrderByDescending(entry => entry.DisplayName),
            ("type", false) => query.OrderBy(entry => entry.Type),
            ("type", true) => query.OrderByDescending(entry => entry.Type),
            ("color", false) => query.OrderBy(entry => entry.Color),
            ("color", true) => query.OrderByDescending(entry => entry.Color),
            ("power", false) => query.OrderBy(entry => entry.Power),
            ("power", true) => query.OrderByDescending(entry => entry.Power),
            ("damage", false) => query.OrderBy(entry => entry.Damage),
            ("damage", true) => query.OrderByDescending(entry => entry.Damage),
            ("createdAtUtc", false) => query.OrderBy(entry => entry.CreatedAtUtc),
            ("createdAtUtc", true) => query.OrderByDescending(entry => entry.CreatedAtUtc),
            ("updatedAtUtc", false) => query.OrderBy(entry => entry.UpdatedAtUtc),
            ("updatedAtUtc", true) => query.OrderByDescending(entry => entry.UpdatedAtUtc),
            _ => query.OrderBy(entry => entry.CardId)
        };
    }

    private static T DeserializeOrDefault<T>(string json, T fallback)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return fallback;
        }

        try
        {
            return JsonSerializer.Deserialize<T>(json, SerializerOptions) ?? fallback;
        }
        catch (JsonException)
        {
            return fallback;
        }
    }

    private static List<string> DeserializeConditions(string json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return [];
        }

        try
        {
            var asStrings = JsonSerializer.Deserialize<List<string>>(json, SerializerOptions);
            if (asStrings is not null)
            {
                return asStrings
                    .Where(condition => !string.IsNullOrWhiteSpace(condition))
                    .Select(condition => condition.Trim())
                    .ToList();
            }
        }
        catch (JsonException)
        {
        }

        try
        {
            var legacy = JsonSerializer.Deserialize<List<LegacyConditionSpec>>(json, SerializerOptions) ?? [];
            return legacy
                .Select(condition => condition.Id)
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .Select(id => id.Trim())
                .ToList();
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static string ToReadableCardType(CardType type)
    {
        return type switch
        {
            CardType.ExCharacter => "EX Character",
            _ => SplitPascalCase(type.ToString())
        };
    }

    private static string ToReadableCardColor(CardColor color)
    {
        return color switch
        {
            CardColor.NotApplicable => "N/A",
            _ => SplitPascalCase(color.ToString())
        };
    }

    private static bool TryParsePatchCardType(string value, out CardType parsedType)
    {
        var normalized = NormalizeForEnumParsing(value);
        if (string.Equals(normalized, "EXCHARACTER", StringComparison.OrdinalIgnoreCase))
        {
            parsedType = CardType.ExCharacter;
            return true;
        }

        if (string.Equals(normalized, "CHAKRA", StringComparison.OrdinalIgnoreCase))
        {
            parsedType = CardType.Chakra;
            return true;
        }

        if (string.Equals(normalized, "SUMMON", StringComparison.OrdinalIgnoreCase))
        {
            parsedType = CardType.Summon;
            return true;
        }

        if (string.Equals(normalized, "LEADER", StringComparison.OrdinalIgnoreCase))
        {
            parsedType = CardType.Leader;
            return true;
        }

        if (string.Equals(normalized, "CHARACTER", StringComparison.OrdinalIgnoreCase))
        {
            parsedType = CardType.Character;
            return true;
        }

        parsedType = default;
        return false;
    }

    private static bool TryParsePatchCardColor(string value, out CardColor parsedColor)
    {
        var normalized = NormalizeForEnumParsing(value);
        if (string.Equals(normalized, "NA", StringComparison.OrdinalIgnoreCase)
            || string.Equals(normalized, "NOTAPPLICABLE", StringComparison.OrdinalIgnoreCase))
        {
            parsedColor = CardColor.NotApplicable;
            return true;
        }

        if (Enum.TryParse<CardColor>(normalized, ignoreCase: true, out var parsed))
        {
            parsedColor = parsed;
            return true;
        }

        parsedColor = default;
        return false;
    }

    private static string NormalizeForEnumParsing(string value)
    {
        return value.Trim()
            .Replace(" ", string.Empty, StringComparison.Ordinal)
            .Replace("-", string.Empty, StringComparison.Ordinal)
            .Replace("/", string.Empty, StringComparison.Ordinal);
    }

    private static void NormalizeLifeAndHealthByType(CardCatalogEntry entry)
    {
        if (entry.Type == CardType.Leader)
        {
            entry.Life ??= entry.Health ?? 0;
            entry.Health = null;
            return;
        }

        entry.Health ??= entry.Life ?? 0;
        entry.Life = null;
    }

    private static string ToReadableEffectKind(EffectKind kind)
    {
        return SplitPascalCase(kind.ToString());
    }

    private static string ToReadableRuntimeEffect(RuntimeEffects runtimeEffect)
    {
        return SplitPascalCase(runtimeEffect.ToString());
    }

    private static string ToReadableEffectTiming(EffectTiming timing)
    {
        return SplitPascalCase(timing.ToString());
    }

    private static string ToReadableEffectDurationMode(EffectDurationMode durationMode)
    {
        return SplitPascalCase(durationMode.ToString());
    }

    private static string ToReadableEffectTargetRange(EffectTargetRange targetRange)
    {
        return SplitPascalCase(targetRange.ToString());
    }

    private static string ToReadableEffectRestrictions(EffectRestrictions restrictions)
    {
        return SplitPascalCase(restrictions.ToString());
    }

    private static CardCatalogAttributeModificationResponse ToAttributeModificationResponse(AttributeModificationSpec spec)
    {
        return new CardCatalogAttributeModificationResponse(
            TargetType: SplitPascalCase(spec.TargetType.ToString()),
            TargetRange: SplitPascalCase(spec.TargetRange.ToString()),
            Attribute: SplitPascalCase(spec.Attribute.ToString()),
            Operation: SplitPascalCase(spec.Operation.ToString()),
            Value: spec.Value,
            MinimumValue: spec.MinimumValue,
            MaximumValue: spec.MaximumValue);
    }

    private static CardCatalogChakraAdjustmentResponse ToChakraAdjustmentResponse(ChakraAdjustmentSpec spec)
    {
        return new CardCatalogChakraAdjustmentResponse(
            TargetRange: SplitPascalCase(spec.TargetRange.ToString()),
            Operation: SplitPascalCase(spec.Operation.ToString()),
            Amount: spec.Amount);
    }

    private static CardCatalogSummonCardFlipResponse ToSummonCardFlipResponse(SummonCardFlipSpec spec)
    {
        return new CardCatalogSummonCardFlipResponse(
            TargetCategory: SplitPascalCase(spec.TargetCategory.ToString()),
            TargetRange: SplitPascalCase(spec.TargetRange.ToString()),
            FaceState: SplitPascalCase(spec.FaceState.ToString()));
    }

    private static CardCatalogFaceStateLockResponse ToFaceStateLockResponse(FaceStateLockSpec spec)
    {
        return new CardCatalogFaceStateLockResponse(
            TargetCategory: SplitPascalCase(spec.TargetCategory.ToString()),
            Operation: SplitPascalCase(spec.Operation.ToString()),
            TargetRange: SplitPascalCase(spec.TargetRange.ToString()));
    }

    private static CardCatalogMoveCardActionResponse ToMoveCardActionResponse(MoveCardActionSpec spec)
    {
        return new CardCatalogMoveCardActionResponse(
            Operation: SplitPascalCase(spec.Operation.ToString()),
            SourceZone: spec.SourceZone.HasValue ? SplitPascalCase(spec.SourceZone.Value.ToString()) : null,
            DestinationZone: spec.DestinationZone.HasValue ? SplitPascalCase(spec.DestinationZone.Value.ToString()) : null,
            DrawCount: spec.DrawCount,
            MoveCount: spec.MoveCount,
            DestinationIndex: spec.DestinationIndex,
            DeckPlacement: spec.DeckPlacement.HasValue ? SplitPascalCase(spec.DeckPlacement.Value.ToString()) : null,
            MultiCardOrdering: spec.MultiCardOrdering.HasValue ? SplitPascalCase(spec.MultiCardOrdering.Value.ToString()) : null,
            AllowCrossPlayer: spec.AllowCrossPlayer,
            DestinationPlayerRange: SplitPascalCase(spec.DestinationPlayerRange.ToString()));
    }

    private static CardCatalogEffectExecutionConditionResponse? ToExecutionConditionResponse(EffectExecutionConditionSpec? condition)
    {
        if (condition is null)
        {
            return null;
        }

        return new CardCatalogEffectExecutionConditionResponse(
            ArgumentKey: condition.ArgumentKey.ToWireValue(),
            ExpectedValue: condition.ExpectedValue,
            IgnoreCase: condition.IgnoreCase,
            Negate: condition.Negate);
    }

    private static ZoneCardRestrictionRuleSet? ResolveRevealPostConditionRuleSet(EffectSpec effect)
    {
        if (effect.RevealPostConditionRuleSet is not null)
        {
            return effect.RevealPostConditionRuleSet;
        }

        var restriction = ResolveRevealPostConditionRestriction(effect);
        if (restriction is null)
        {
            return null;
        }

        return new ZoneCardRestrictionRuleSet
        {
            Operator = RequirementGroupOperator.All,
            Restrictions =
            [
                restriction,
            ],
        };
    }

    private static ZoneCardRestriction? ResolveRevealPostConditionRestriction(EffectSpec effect)
    {
        if (effect.RevealPostConditionRuleSet?.Restrictions is { Count: > 0 })
        {
            return effect.RevealPostConditionRuleSet.Restrictions[0];
        }

        if (effect.RevealPostConditionRestriction is not null)
        {
            return effect.RevealPostConditionRestriction;
        }

        if (effect.RevealPostConditionPredicate is null)
        {
            return null;
        }

        return new ZoneCardRestriction
        {
            MatchMode = ZoneRestrictionMatchMode.All,
            Predicates =
            [
                effect.RevealPostConditionPredicate,
            ],
        };
    }

    private static ZoneCardPropertyPredicate? ResolveRevealPostConditionPredicate(EffectSpec effect)
    {
        return effect.RevealPostConditionPredicate
            ?? effect.RevealPostConditionRestriction?.Predicates?.FirstOrDefault();
    }

    private static CardCatalogZoneCardRestrictionResponse? ToNullableZoneCardRestrictionResponse(ZoneCardRestriction? restriction)
    {
        return restriction is null ? null : ToZoneCardRestrictionResponse(restriction);
    }

    private static CardCatalogZoneCardRestrictionRuleSetResponse? ToNullableZoneCardRestrictionRuleSetResponse(ZoneCardRestrictionRuleSet? ruleSet)
    {
        if (ruleSet is null)
        {
            return null;
        }

        return new CardCatalogZoneCardRestrictionRuleSetResponse(
            Restrictions: ruleSet.Restrictions.Select(ToZoneCardRestrictionResponse).ToList(),
            Operator: SplitPascalCase(ruleSet.Operator.ToString()));
    }

    private static CardCatalogZoneCardPropertyPredicateResponse? ToNullableZoneCardPropertyPredicateResponse(ZoneCardPropertyPredicate? predicate)
    {
        if (predicate is null)
        {
            return null;
        }

        return new CardCatalogZoneCardPropertyPredicateResponse(
            Property: SplitPascalCase(predicate.Property.ToString()),
            Operator: SplitPascalCase(predicate.Operator.ToString()),
            Value: predicate.Value,
            Values: predicate.Values ?? [],
            IgnoreCase: predicate.IgnoreCase);
    }

    private static CardCatalogPassiveReevaluationResponse? ToPassiveReevaluationResponse(PassiveReevaluationSpec? spec)
    {
        if (spec is null)
        {
            return null;
        }

        return new CardCatalogPassiveReevaluationResponse(
            TriggerKinds: spec.TriggerKinds.Select(kind => SplitPascalCase(kind.ToString())).ToList(),
            Scope: SplitPascalCase(spec.Scope.ToString()));
    }

    private static CardCatalogPassiveConsequenceResponse ToPassiveConsequenceResponse(PassiveConsequenceSpec spec)
    {
        return new CardCatalogPassiveConsequenceResponse(
            ConsequenceEffectTypeKey: spec.ConsequenceEffectTypeKey,
            TargetPolicy: SplitPascalCase(spec.TargetPolicy.ToString()),
            ConsequenceArguments: spec.ConsequenceArguments is null
                ? new Dictionary<string, string>(StringComparer.Ordinal)
                : new Dictionary<string, string>(spec.ConsequenceArguments, StringComparer.Ordinal));
    }

    private static CardCatalogKeywordModificationResponse ToKeywordModificationResponse(KeywordModificationSpec spec)
    {
        return new CardCatalogKeywordModificationResponse(
            TargetType: SplitPascalCase(spec.TargetType.ToString()),
            Operation: SplitPascalCase(spec.Operation.ToString()),
            Keyword: spec.Keyword);
    }

    private static CardCatalogEffectContextRuleSetResponse ToContextRuleResponse(EffectContextRuleSet rule)
    {
        return new CardCatalogEffectContextRuleSetResponse(
            Player: ToContextConditionResponse(rule.Player),
            Opponent: ToContextConditionResponse(rule.Opponent));
    }

    private static CardCatalogEffectContextConditionResponse? ToContextConditionResponse(EffectContextCondition? condition)
    {
        if (condition is null)
        {
            return null;
        }

        return new CardCatalogEffectContextConditionResponse(
            InZone: condition.InZone.HasValue ? SplitPascalCase(condition.InZone.Value.ToString()) : null,
            InZoneRequirements: ToZoneRequirementSetResponse(condition.InZoneRequirements));
    }

    private static CardCatalogZoneRequirementSetResponse? ToZoneRequirementSetResponse(ZoneRequirementSet? requirementSet)
    {
        if (requirementSet is null)
        {
            return null;
        }

        return new CardCatalogZoneRequirementSetResponse(
            Requirements: requirementSet.Requirements
                .Select(ToZoneAmountRequirementResponse)
                .ToList(),
            Operator: SplitPascalCase(requirementSet.Operator.ToString()),
            DistinctCardsAcrossRequirements: requirementSet.DistinctCardsAcrossRequirements);
    }

    private static CardCatalogZoneAmountRequirementResponse ToZoneAmountRequirementResponse(ZoneAmountRequirement requirement)
    {
        return new CardCatalogZoneAmountRequirementResponse(
            Amount: requirement.Amount,
            Comparison: SplitPascalCase(requirement.Comparison.ToString()),
            Restriction: ToZoneCardRestrictionResponse(requirement.Restriction));
    }

    private static CardCatalogEffectTargetRuleSetResponse ToTargetRuleSetResponse(EffectTargetRuleSet ruleSet)
    {
        return new CardCatalogEffectTargetRuleSetResponse(
            Operator: SplitPascalCase(ruleSet.Operator.ToString()),
            ExactTargetCount: ruleSet.ExactTargetCount,
            MinimumTargetCount: ruleSet.MinimumTargetCount,
            MaximumTargetCount: ruleSet.MaximumTargetCount,
            AutoSelectAllValidTargets: ruleSet.AutoSelectAllValidTargets,
            TributeComposition: ToTributeTargetCompositionResponse(ruleSet.TributeComposition),
            Rules: ruleSet.Rules
                .Select(ToTargetRuleResponse)
                .ToList());
    }

    private static CardCatalogEffectTargetRuleResponse ToTargetRuleResponse(EffectTargetRule rule)
    {
        return new CardCatalogEffectTargetRuleResponse(
            Scope: SplitPascalCase(rule.Scope.ToString()),
            InZone: SplitPascalCase(rule.InZone.ToString()),
            LocationSelector: ToTargetLocationSelectorResponse(rule.LocationSelector),
            TributeRole: rule.TributeRole.HasValue ? SplitPascalCase(rule.TributeRole.Value.ToString()) : null,
            ExactSelectedTargetCount: rule.ExactSelectedTargetCount,
            MinimumSelectedTargetCount: rule.MinimumSelectedTargetCount,
            MaximumSelectedTargetCount: rule.MaximumSelectedTargetCount,
            Restriction: ToZoneCardRestrictionResponse(rule.Restriction));
    }

    private static CardCatalogEffectTargetLocationSelectorResponse ToTargetLocationSelectorResponse(EffectTargetLocationSelector selector)
    {
        selector ??= new EffectTargetLocationSelector();

        return new CardCatalogEffectTargetLocationSelectorResponse(
            Kind: SplitPascalCase(selector.Kind.ToString()),
            SupportSlotIndex: selector.SupportSlotIndex);
    }

    private static CardCatalogZoneCardRestrictionResponse ToZoneCardRestrictionResponse(ZoneCardRestriction restriction)
    {
        return new CardCatalogZoneCardRestrictionResponse(
            Predicates: (restriction.Predicates ?? [])
                .Select(ToZoneCardPropertyPredicateResponse)
                .ToList(),
            MatchMode: SplitPascalCase(restriction.MatchMode.ToString()));
    }

    private static CardCatalogZoneCardPropertyPredicateResponse ToZoneCardPropertyPredicateResponse(ZoneCardPropertyPredicate predicate)
    {
        return new CardCatalogZoneCardPropertyPredicateResponse(
            Property: SplitPascalCase(predicate.Property.ToString()),
            Operator: SplitPascalCase(predicate.Operator.ToString()),
            Value: predicate.Value,
            Values: predicate.Values ?? [],
            IgnoreCase: predicate.IgnoreCase);
    }

    private static CardCatalogTributeTargetCompositionResponse? ToTributeTargetCompositionResponse(TributeTargetComposition? composition)
    {
        if (composition is null)
        {
            return null;
        }

        return new CardCatalogTributeTargetCompositionResponse(
            ExactTributeCount: composition.ExactTributeCount,
            MinimumTributeCount: composition.MinimumTributeCount,
            MaximumTributeCount: composition.MaximumTributeCount,
            RequireSingleSummonTarget: composition.RequireSingleSummonTarget,
            RequireDistinctSummonAndTributes: composition.RequireDistinctSummonAndTributes);
    }

    private static string SplitPascalCase(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var builder = new StringBuilder(value.Length + 8);
        builder.Append(value[0]);

        for (var index = 1; index < value.Length; index++)
        {
            var current = value[index];
            var previous = value[index - 1];
            var hasNext = index + 1 < value.Length;
            var next = hasNext ? value[index + 1] : '\0';

            if (char.IsUpper(current) &&
                (char.IsLower(previous) || (hasNext && char.IsLower(next))))
            {
                builder.Append(' ');
            }

            builder.Append(current);
        }

        return builder.ToString();
    }

    private static string Serialize<T>(T value)
    {
        return JsonSerializer.Serialize(value, SerializerOptions);
    }

    private sealed record LegacyConditionSpec(string Id);
}