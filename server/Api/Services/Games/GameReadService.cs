using ErrorOr;
using Microsoft.EntityFrameworkCore;
using ProjectHiddenVillage.Server.Data;
using ProjectHiddenVillage.Server.Data.Entities;
using System.Text.Json;

namespace ProjectHiddenVillage.Server;

public sealed class GamesReadService(
    InMemoryGameInstanceRegistry registry,
    ICardMappingService cardMappingService,
    ApplicationDbContext dbContext,
    IGameEffectHandlingService gameEffectHandlingService) : IGameReadService
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web);

    public async Task<ErrorOr<List<CardCatalogItemResponse>>> GetCardDataForGame(string gameCode)
    {
        if (string.IsNullOrWhiteSpace(gameCode))
        {
            return Error.Validation(code: "Game.GetById.MissingId", description: "Game code is required.");
        }

        var normalizedGameCode = gameCode.Trim();

        if (registry.TryGet(normalizedGameCode, out var runtimeGame) && runtimeGame is not null)
        {
            var runtimeCardIds = runtimeGame.State.Players
                .SelectMany(player => player.Deck)
                .Select(card => card.CardDefinitionId?.Trim())
                .Where(cardId => !string.IsNullOrWhiteSpace(cardId))
                .Cast<string>()
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (runtimeCardIds.Count == 0)
            {
                return [];
            }

            return await cardMappingService.GetCardCatalogByIds(runtimeCardIds);
        }

        var deckAssignments = await dbContext.GameInstances
            .AsNoTracking()
            .Where(game => game.JoinCode == normalizedGameCode)
            .Select(game => new { game.Player1DeckId, game.Player2DeckId })
            .SingleOrDefaultAsync();

        if (deckAssignments is null)
        {
            return Error.NotFound(code: "Game.NotFound", description: $"Game instance '{normalizedGameCode}' was not found.");
        }

        var rawCardIds = await dbContext.DeckCards
            .AsNoTracking()
            .Where(deckCard => deckCard.DeckId == deckAssignments.Player1DeckId || deckCard.DeckId == deckAssignments.Player2DeckId)
            .Select(deckCard => deckCard.CardCatalogEntry.CardId)
            .ToListAsync();

        var cardIds = rawCardIds
            .Select(cardId => cardId?.Trim())
            .Where(cardId => !string.IsNullOrWhiteSpace(cardId))
            .Cast<string>()
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (cardIds.Count == 0)
        {
            return [];
        }

        return await cardMappingService.GetCardCatalogByIds(cardIds);
    }

    public async Task<ErrorOr<ResolvedPlayerDeck>> ResolvePlayerDeckData(Guid userId, Guid deckId, string operationName)
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

    public ErrorOr<GameInstance> GetById(string gameCode)
    {
        if (string.IsNullOrWhiteSpace(gameCode))
        {
            return Error.Validation(code: "Game.GetById.MissingId", description: "Game code is required.");
        }

        if (!registry.TryGet(gameCode.Trim(), out var game) || game is null)
        {
            return Error.NotFound(code: "Game.NotFound", description: $"Game instance '{gameCode}' was not found.");
        }

        return game;
    }

    private Card ToRuntimeCard(CardCatalogEntry entry)
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
                RecoveryEffect = gameEffectHandlingService.ExtractRecoveryEffect(entry.Description)
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
        card.MainEffect = gameEffectHandlingService.ExtractMainEffect(entry.Description);
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
}
