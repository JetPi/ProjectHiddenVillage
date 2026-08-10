using ErrorOr;
using Microsoft.EntityFrameworkCore;

namespace ProjectHiddenVillage.Server;

public sealed partial class GamesService
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
