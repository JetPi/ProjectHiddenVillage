using System.Text.Json;
using System.Text.RegularExpressions;
using ErrorOr;
using Microsoft.EntityFrameworkCore;
using ProjectHiddenVillage.Server.Data;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server;

public sealed class GameDeckResolverService(ApplicationDbContext dbContext) : IGameDeckResolverService
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web);

    public async Task<ErrorOr<ResolvedPlayerDeck>> ResolvePlayerDeck(Guid userId, Guid deckId, string operationName)
    {
        var user = await dbContext.Users
            .AsNoTracking()
            .SingleOrDefaultAsync(record => record.Id == userId);

        if (user is null)
        {
            return Error.NotFound(
                code: $"{operationName}.UserNotFound",
                description: $"User '{userId}' was not found.");
        }

        var deck = await dbContext.Decks
            .AsNoTracking()
            .Include(record => record.Cards)
            .ThenInclude(card => card.CardCatalogEntry)
            .SingleOrDefaultAsync(record => record.Id == deckId);

        if (deck is null)
        {
            return Error.NotFound(
                code: $"{operationName}.DeckNotFound",
                description: $"Deck '{deckId}' was not found.");
        }

        if (deck.Type == DeckType.User && deck.UserId != userId)
        {
            return Error.Validation(
                code: $"{operationName}.DeckOwnershipMismatch",
                description: "The selected user deck does not belong to this user.");
        }

        if (deck.Cards.Count == 0)
        {
            return Error.Validation(
                code: $"{operationName}.DeckHasNoCards",
                description: "Deck must contain at least one card.");
        }

        var deckCardIds = new List<string>();
        var cardDefinitions = new Dictionary<string, Card>(StringComparer.Ordinal);

        foreach (var deckCard in deck.Cards)
        {
            if (deckCard.Quantity <= 0)
            {
                continue;
            }

            var cardId = deckCard.CardCatalogEntry.CardId.Trim();
            if (string.IsNullOrWhiteSpace(cardId))
            {
                continue;
            }

            for (var copyIndex = 0; copyIndex < deckCard.Quantity; copyIndex++)
            {
                deckCardIds.Add(cardId);
            }

            if (!cardDefinitions.ContainsKey(cardId))
            {
                cardDefinitions[cardId] = ToRuntimeCard(deckCard.CardCatalogEntry);
            }
        }

        if (deckCardIds.Count == 0)
        {
            return Error.Validation(
                code: $"{operationName}.DeckHasNoCards",
                description: "Deck must contain at least one card.");
        }

        var playerId = user.Id.ToString("N");
        var player = new Player
        {
            Id = playerId,
            Name = user.Username,
            DisplayName = user.Username,
            Deck = deckCardIds
        };

        return new ResolvedPlayerDeck(player, cardDefinitions);
    }

    private static Card ToRuntimeCard(CardCatalogEntry entry)
    {
        var names = DeserializeOrDefault<List<string>>(entry.NameJson, []);
        var traits = DeserializeOrDefault<List<string>>(entry.TraitsJson, []);
        var conditions = DeserializeOrDefault<List<ConditionSpec>>(entry.ConditionsJson, []);
        var effects = DeserializeOrDefault<List<EffectSpec>>(entry.EffectsJson, []);

        Card card = entry.Type switch
        {
            CardType.Leader => new LeaderCard
            {
                Life = entry.Life ?? 0,
                RecoveryEffect = ExtractRecoveryEffect(entry.Description)
            },
            CardType.Character or CardType.ExCharacter => new CharacterCard
            {
                Health = entry.Health ?? 0,
                SupportName = entry.SupportName ?? string.Empty,
                SupportEffect = entry.SupportEffect ?? string.Empty,
                SupportCost = entry.SupportCost ?? 0
            },
            _ => new Card()
        };

        card.Id = entry.CardId;
        card.Image = entry.Image;
        card.OriginalId = entry.OriginalId;
        card.MainAlternate = entry.MainAlternate;
        card.Attribute = entry.Attribute;
        card.Name = names;
        card.DisplayName = entry.DisplayName;
        card.Type = entry.Type;
        card.Traits = traits;
        card.Color = entry.Color;
        card.Description = entry.Description;
        card.MainEffect = ExtractMainEffect(entry.Description);
        card.Damage = entry.Damage;
        card.Power = entry.Power;
        card.Conditions = conditions;
        card.Effects = effects;

        return card;
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

    private static string ExtractRecoveryEffect(string description)
    {
        if (string.IsNullOrWhiteSpace(description))
        {
            return string.Empty;
        }

        const string marker = "[Recovery]";
        var index = description.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
        if (index < 0)
        {
            return string.Empty;
        }

        return description[(index + marker.Length)..].Trim();
    }

    private static string ExtractMainEffect(string description)
    {
        if (string.IsNullOrWhiteSpace(description))
        {
            return string.Empty;
        }

        const string supportMarker = "[Support]";
        const string recoveryMarker = "[Recovery]";

        var supportIndex = description.IndexOf(supportMarker, StringComparison.OrdinalIgnoreCase);
        var recoveryIndex = description.IndexOf(recoveryMarker, StringComparison.OrdinalIgnoreCase);

        var endIndex = description.Length;
        if (supportIndex >= 0)
        {
            endIndex = supportIndex;
        }

        if (recoveryIndex >= 0)
        {
            endIndex = Math.Min(endIndex, recoveryIndex);
        }

        var mainEffectSegment = description[..endIndex];
        var withoutBrTags = Regex.Replace(mainEffectSegment, @"<br\s*/?>", " ", RegexOptions.IgnoreCase);
        return withoutBrTags.Trim();
    }
}
