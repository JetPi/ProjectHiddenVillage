using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using ErrorOr;
using Microsoft.EntityFrameworkCore;
using ProjectHiddenVillage.Server.Api.Interfaces.Deck;
using ProjectHiddenVillage.Server.Data;
using ProjectHiddenVillage.Server.Data.DTOs;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server;

public sealed partial class DeckService : IDeckService
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web);

    [GeneratedRegex(@"^\s*(\d+)x\s+([A-Za-z0-9\-]+)\s*$", RegexOptions.CultureInvariant)]
    private static partial Regex DeckLinePattern();

    private readonly ApplicationDbContext dbContext;

    public DeckService(ApplicationDbContext dbContext)
    {
        this.dbContext = dbContext;
    }

    public async Task<ErrorOr<string>> CreateDeck(CreateDeckRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (string.IsNullOrWhiteSpace(request.Cards))
        {
            return Error.Validation(
                    code: "Deck.Create.EmptyCards",
                    description: "Cards payload is required.");
        }

        if (request.Type == DeckType.User && !request.UserId.HasValue)
        {
            return Error.Validation(
                    code: "Deck.Create.UserDeckRequiresUserId",
                    description: "UserId is required when deck type is User.");
        }

        if (request.UserId.HasValue)
        {
            var userExists = await dbContext.Users.AnyAsync(user => user.Id == request.UserId.Value);
            if (!userExists)
            {
                return Error.NotFound(
                        code: "Deck.Create.UserNotFound",
                        description: $"User '{request.UserId.Value}' was not found.");
            }
        }

        var parseResult = ParseCards(request.Cards);
        if (parseResult.IsError)
        {
            return parseResult.Errors;
        }

        var parsedCards = parseResult.Value;
        var requestedCardIds = parsedCards
                .Select(card => card.CardId)
                .ToHashSet(StringComparer.Ordinal);

        var cardCatalogEntries = await dbContext.CardCatalogEntries
                .AsNoTracking()
                .Where(entry => requestedCardIds.Contains(entry.CardId.ToUpper()))
                .Select(entry => new { entry.Id, entry.CardId })
                .ToListAsync();

        var cardCatalogById = cardCatalogEntries
                .ToDictionary(
                        keySelector: entry => entry.CardId.ToUpperInvariant(),
                        elementSelector: entry => entry.Id,
                        comparer: StringComparer.Ordinal);

        var missingCardIds = parsedCards
                .Select(card => card.CardId)
                .Where(cardId => !cardCatalogById.ContainsKey(cardId))
                .Distinct(StringComparer.Ordinal)
                .ToList();

        if (missingCardIds.Count > 0)
        {
            return Error.Validation(
                    code: "Deck.Create.UnknownCardIds",
                    description: $"Unknown card id(s): {string.Join(", ", missingCardIds)}.");
        }

        var deck = new Deck
        {
            Type = request.Type,
            UserId = request.UserId,
            Cards = parsedCards.ConvertAll(card => new DeckCard
            {
                CardCatalogEntryId = cardCatalogById[card.CardId],
                Quantity = card.Quantity
            })
        };

        dbContext.Decks.Add(deck);

        try
        {
            await dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            return Error.Failure(
                    code: "Deck.Create.PersistFailed",
                    description: "Deck could not be persisted.");
        }

        return deck.Id.ToString();
    }

    public async Task<ErrorOr<DeckResponse>> GetDeck(string deckId, bool populate = false)
    {
        if (!Guid.TryParse(deckId, out var parsedDeckId))
        {
            return Error.Validation(
                    code: "Deck.Get.InvalidId",
                    description: "Deck id must be a valid GUID.");
        }

        if (!populate)
        {
            var deck = await dbContext.Decks
                    .AsNoTracking()
                    .Where(record => record.Id == parsedDeckId)
                    .Select(ToDeckResponseExpression())
                    .SingleOrDefaultAsync();

            return deck ?? (ErrorOr<DeckResponse>)Error.NotFound(
                        code: "Deck.Get.NotFound",
                        description: $"Deck '{deckId}' was not found.");
        }

        var deckWithCards = await dbContext.Decks
                .AsNoTracking()
                .Include(record => record.Cards)
                .ThenInclude(card => card.CardCatalogEntry)
                .SingleOrDefaultAsync(record => record.Id == parsedDeckId);

        if (deckWithCards is null)
        {
            return Error.NotFound(
                    code: "Deck.Get.NotFound",
                    description: $"Deck '{deckId}' was not found.");
        }

        return ToDeckResponse(deckWithCards, populate: true);
    }

    public async Task<ErrorOr<List<DeckResponse>>> GetDecks(Guid? userId = null, bool populate = false)
    {
        if (!populate)
        {
            var query = dbContext.Decks.AsNoTracking();

            if (userId.HasValue)
            {
                query = query.Where(record => record.UserId == userId.Value);
            }

            return await query
                    .OrderBy(record => record.Id)
                    .Select(ToDeckResponseExpression())
                    .ToListAsync();
        }

        var populatedQuery = dbContext.Decks
                .AsNoTracking()
                .Include(record => record.Cards)
                .ThenInclude(card => card.CardCatalogEntry)
                .AsQueryable();

        if (userId.HasValue)
        {
            populatedQuery = populatedQuery.Where(record => record.UserId == userId.Value);
        }

        var decks = await populatedQuery
                .OrderBy(record => record.Id)
                .ToListAsync();

        return decks.Select(deck => ToDeckResponse(deck, populate: true)).ToList();
    }

    private static System.Linq.Expressions.Expression<Func<Deck, DeckResponse>> ToDeckResponseExpression()
    {
        return deck => new DeckResponse(
                Id: deck.Id,
                Type: deck.Type.ToString(),
                UserId: deck.UserId,
                Cards: deck.Cards
                        .OrderBy(card => card.CardCatalogEntry.CardId)
                        .Select(card => new DeckCardResponse(
                                CardId: card.CardCatalogEntry.CardId,
                                Quantity: card.Quantity))
                        .ToList());
    }

    private static DeckResponse ToDeckResponse(Deck deck, bool populate)
    {
        return new DeckResponse(
                Id: deck.Id,
                Type: deck.Type.ToString(),
                UserId: deck.UserId,
                Cards: deck.Cards
                        .OrderBy(card => card.CardCatalogEntry.CardId)
                        .Select(card => new DeckCardResponse(
                                CardId: card.CardCatalogEntry.CardId,
                                Quantity: card.Quantity,
                                Card: populate ? ToCatalogResponse(card.CardCatalogEntry) : null))
                        .ToList());
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
                        .ConvertAll(condition => new CardCatalogConditionResponse(
                                Id: condition.Id,
                                Args: condition.Args))
,
                Effects: effects
                        .ConvertAll(effect => new CardCatalogEffectResponse(
                                Id: effect.Id,
                        EffectType: ToReadableEffectKind(effect.EffectType),
                                Timing: ToReadableEffectTiming(effect.Timing),
                        TargetRange: ToReadableEffectTargetRange(effect.TargetRange),
                        IsOptional: effect.IsOptional,
                        ChakraCost: effect.ChakraCost,
                        GlobalRestrictions: ToReadableEffectRestrictions(effect.GlobalRestrictions),
                        ContextRules: effect.ContextRules))
,
                Life: entry.Life,
                Health: entry.Health,
                SupportName: entry.SupportName,
                SupportEffect: entry.SupportEffect,
                SupportCost: entry.SupportCost);
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

    private static ErrorOr<List<ParsedDeckCard>> ParseCards(string cardsPayload)
    {
        var quantitiesByCardId = new Dictionary<string, int>(StringComparer.Ordinal);
        var lines = cardsPayload.Split(['\n', '\r'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        for (var lineIndex = 0; lineIndex < lines.Length; lineIndex++)
        {
            var line = lines[lineIndex];
            var match = DeckLinePattern().Match(line);

            if (!match.Success)
            {
                return Error.Validation(
                        code: "Deck.Create.InvalidCardsFormat",
                        description: $"Line {lineIndex + 1} is invalid. Expected format '<quantity>x <cardId>'.");
            }

            if (!int.TryParse(match.Groups[1].Value, out var quantity) || quantity <= 0)
            {
                return Error.Validation(
                        code: "Deck.Create.InvalidQuantity",
                        description: $"Line {lineIndex + 1} has an invalid quantity.");
            }

            var cardId = match.Groups[2].Value.ToUpperInvariant();
            quantitiesByCardId.TryGetValue(cardId, out var existingQuantity);
            quantitiesByCardId[cardId] = existingQuantity + quantity;
        }

        return quantitiesByCardId
                .Select(pair => new ParsedDeckCard(pair.Key, pair.Value))
                .ToList();
    }

}