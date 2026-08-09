using ErrorOr;
using Microsoft.EntityFrameworkCore;
using ProjectHiddenVillage.Server.Data;
using ProjectHiddenVillage.Server.Data.Entities;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace ProjectHiddenVillage.Server;

public sealed class GamesService
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web);

    private readonly InMemoryGameInstanceRegistry registry;
    private readonly CardMappingService cardMappingService;
    private readonly ApplicationDbContext dbContext;

    public GamesService(
        InMemoryGameInstanceRegistry registry,
        CardMappingService cardMappingService,
        ApplicationDbContext dbContext)
    {
        this.registry = registry;
        this.cardMappingService = cardMappingService;
        this.dbContext = dbContext;
    }

    public async Task<ErrorOr<GameInstance>> CreateGameForUser(CreateGameForUserRequest request)
    {
        return await CreateGameForUser(request, preferredGameCode: null);
    }

    public async Task<ErrorOr<GameInstance>> CreateGameForUser(CreateGameForUserRequest request, string? preferredGameCode)
    {
        ArgumentNullException.ThrowIfNull(request);

        var playerDeckResult = await ResolvePlayerDeck(request.UserId, request.DeckId, operationName: "Game.CreateForUser");
        if (playerDeckResult.IsError)
        {
            return playerDeckResult.Errors;
        }

        var playerDeck = playerDeckResult.Value;

        try
        {
            return registry.Create([playerDeck.Player], playerDeck.CardDefinitions, preferredGameCode);
        }
        catch (ArgumentException ex)
        {
            return Error.Validation(code: "Game.CreateForUser.InvalidRequest", description: ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            return Error.Validation(code: "Game.CreateForUser.InvalidState", description: ex.Message);
        }
    }

    public async Task<ErrorOr<List<CardCatalogItemResponse>>> GetCardsForGame(string gameCode)
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

    public async Task<ErrorOr<GameInstance>> JoinGameForUser(string gameCode, JoinGameAsPlayer request)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (string.IsNullOrWhiteSpace(gameCode))
        {
            return Error.Validation(code: "Game.JoinForUser.MissingCode", description: "Game code is required.");
        }

        var normalizedGameCode = gameCode.Trim();
        if (!registry.TryGet(normalizedGameCode, out var game) || game is null)
        {
            return Error.NotFound(code: "Game.JoinForUser.NotFound", description: $"Game instance '{normalizedGameCode}' was not found.");
        }

        var existingPlayer = game.State.Players
            .SingleOrDefault(player => string.Equals(player.PlayerId, request.UserId.ToString("N"), StringComparison.Ordinal));

        if (existingPlayer is not null)
        {
            if (HasStoredDeck(existingPlayer))
            {
                return game;
            }

            return Error.Validation(
                code: "Game.JoinForUser.MissingStoredDeck",
                description: "User is already part of this game instance, but no stored deck was found for that player.");
        }

        if (!request.DeckId.HasValue || request.DeckId.Value == Guid.Empty)
        {
            return Error.Validation(code: "Game.JoinForUser.MissingDeckId", description: "DeckId is required.");
        }

        var playerDeckResult = await ResolvePlayerDeck(request.UserId, request.DeckId.Value, operationName: "Game.JoinForUser");
        if (playerDeckResult.IsError)
        {
            return playerDeckResult.Errors;
        }

        var playerDeck = playerDeckResult.Value;
        return ExecuteRegistryOperation(
            operationName: "Game.JoinForUser",
            operation: () => registry.Join(normalizedGameCode, playerDeck.Player, playerDeck.CardDefinitions));
    }

    public ErrorOr<GameInstance> ResolvePrompt(string gameId, ResolvePromptRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        return ExecuteRegistryOperation(
            operationName: "Game.ResolvePrompt",
            operation: () => registry.ResolvePrompt(gameId, request.RequestedPlayerId, request.SelectedOption));
    }

    public ErrorOr<GameInstance> AdvancePhase(string gameId)
    {
        return ExecuteRegistryOperation(
            operationName: "Game.AdvancePhase",
            operation: () => registry.AdvancePhase(gameId));
    }

    public ErrorOr<GameInstance> DeclarePassInActionStep(string gameId, PlayerPhaseActionRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        return ExecuteRegistryOperation(
            operationName: "Game.DeclarePassInActionStep",
            operation: () => registry.DeclarePassInActionStep(gameId, request.PlayerId));
    }

    public ErrorOr<GameInstance> DeclareActionInActionStep(string gameId, PlayerPhaseActionRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        return ExecuteRegistryOperation(
            operationName: "Game.DeclareActionInActionStep",
            operation: () => registry.DeclareActionInActionStep(gameId, request.PlayerId));
    }

    public ErrorOr<GameInstance> DeclareEndStep(string gameId)
    {
        return ExecuteRegistryOperation(
            operationName: "Game.DeclareEndStep",
            operation: () => registry.DeclareEndStep(gameId));
    }

    public ErrorOr<GameInstance> CompleteEndStep(string gameId)
    {
        return ExecuteRegistryOperation(
            operationName: "Game.CompleteEndStep",
            operation: () => registry.CompleteEndStep(gameId));
    }

    private static ErrorOr<GameInstance> ExecuteRegistryOperation(string operationName, Func<GameInstance> operation)
    {
        try
        {
            return operation();
        }
        catch (KeyNotFoundException ex)
        {
            return Error.NotFound(code: $"{operationName}.NotFound", description: ex.Message);
        }
        catch (ArgumentException ex)
        {
            return Error.Validation(code: $"{operationName}.InvalidRequest", description: ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            return Error.Validation(code: $"{operationName}.InvalidState", description: ex.Message);
        }
    }

    private async Task<ErrorOr<ResolvedPlayerDeck>> ResolvePlayerDeck(Guid userId, Guid deckId, string operationName)
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

    private static bool HasStoredDeck(PlayerState playerState)
    {
        return playerState.Deck.Any(card => !string.IsNullOrWhiteSpace(card.CardDefinitionId));
    }

    private sealed record ResolvedPlayerDeck(
        Player Player,
        IReadOnlyDictionary<string, Card> CardDefinitions);

}