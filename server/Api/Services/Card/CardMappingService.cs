using ErrorOr;
using System.Text.Json;
using System.Text;
using Microsoft.EntityFrameworkCore;
using ProjectHiddenVillage.Server.Api.Interfaces.Card;
using ProjectHiddenVillage.Server.Data;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server;

public sealed class CardMappingService : ICardMappingService
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web);
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
            entry.SupportCost = character.SupportCost;
        }

        return entry;
    }

    private static CardCatalogItemResponse ToCatalogResponse(CardCatalogEntry entry)
    {
        var names = DeserializeOrDefault<List<string>>(entry.NameJson, []);
        var traits = DeserializeOrDefault<List<string>>(entry.TraitsJson, []);
        var conditions = DeserializeOrDefault<List<ConditionSpec>>(entry.ConditionsJson, []);
        var effects = DeserializeOrDefault<List<EffectSpec>>(entry.EffectsJson, []);

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
            Conditions: conditions
                .Select(condition => new CardCatalogConditionResponse(
                    Id: condition.Id,
                    Args: condition.Args))
                .ToList(),
            Effects: effects
                .Select(effect => new CardCatalogEffectResponse(
                    Id: effect.Id,
                    EffectType: ToReadableEffectKind(effect.EffectType),
                    Timing: ToReadableEffectTiming(effect.Timing),
                    TargetRange: ToReadableEffectTargetRange(effect.TargetRange),
                    IsOptional: effect.IsOptional,
                    ChakraCost: effect.ChakraCost,
                    GlobalRestrictions: ToReadableEffectRestrictions(effect.GlobalRestrictions),
                    AttributeModifications: effect.AttributeModifications,
                    ContextRules: effect.ContextRules,
                    TargetRules: effect.TargetRules))
                .ToList(),
            Life: entry.Life,
            Health: entry.Health,
            SupportName: entry.SupportName,
            SupportEffect: entry.SupportEffect,
            SupportCost: entry.SupportCost);
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

        if (source.Cost.HasValue && mapped is CharacterCard mappedCharacter)
        {
            existing.SupportCost = mappedCharacter.SupportCost;
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
        return SplitPascalCase(color.ToString());
    }

    private static string ToReadableEffectKind(EffectKind kind)
    {
        return SplitPascalCase(kind.ToString());
    }

    private static string ToReadableEffectTiming(EffectTiming timing)
    {
        return SplitPascalCase(timing.ToString());
    }

    private static string ToReadableEffectTargetRange(EffectTargetRange targetRange)
    {
        return SplitPascalCase(targetRange.ToString());
    }

    private static string ToReadableEffectRestrictions(EffectRestrictions restrictions)
    {
        return SplitPascalCase(restrictions.ToString());
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
}