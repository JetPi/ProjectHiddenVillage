using ErrorOr;
using Microsoft.EntityFrameworkCore;
using ProjectHiddenVillage.Server.Api.Interfaces.Card;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Data;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server;

public sealed class GamesReadService(
    InMemoryGameInstanceRegistry registry,
    ICardMappingService cardMappingService,
    ApplicationDbContext dbContext,
    IGameRuntimeDeckService gameRuntimeDeckService) : IGameReadService
{
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

    public ErrorOr<GameState> GetCurrentGameState(string gameCode)
    {
        var gameResult = GetById(gameCode);
        if (gameResult.IsError)
        {
            return gameResult.Errors;
        }

        return gameResult.Value.State;
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
                cardDefinitions[cardId] = gameRuntimeDeckService.ToRuntimeCard(deckCard.CardCatalogEntry);
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
}
