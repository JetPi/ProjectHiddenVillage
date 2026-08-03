using ErrorOr;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using ProjectHiddenVillage.Server.Data;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server;

public sealed class CardMappingService
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web);

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

    private static string Serialize<T>(T value)
    {
        return JsonSerializer.Serialize(value, SerializerOptions);
    }
}