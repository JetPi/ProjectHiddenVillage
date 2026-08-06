using ErrorOr;
using Microsoft.EntityFrameworkCore;
using ProjectHiddenVillage.Server.Data;

namespace ProjectHiddenVillage.Server;

public sealed class GamesService
{
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

    public ErrorOr<GameInstance> Create(CreateGameInstanceRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        try
        {
            var cardDefinitions = request.CardDefinitions.ToDictionary(
                keySelector: card => card.Id,
                elementSelector: card => card,
                comparer: StringComparer.Ordinal);

            return registry.Create(request.Players, cardDefinitions);
        }
        catch (ArgumentException ex)
        {
            return Error.Validation(code: "Game.Create.InvalidRequest", description: ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            return Error.Validation(code: "Game.Create.InvalidState", description: ex.Message);
        }
    }

    public async Task<ErrorOr<List<CardCatalogItemResponse>>> GetCardsForGame(string gameId)
    {
        if (string.IsNullOrWhiteSpace(gameId))
        {
            return Error.Validation(code: "Game.GetById.MissingId", description: "Game id is required.");
        }

        if (!Guid.TryParse(gameId.Trim(), out var parsedGameId))
        {
            return Error.NotFound(code: "Game.NotFound", description: $"Game instance '{gameId}' was not found.");
        }

        var deckAssignments = await dbContext.GameInstances
            .AsNoTracking()
            .Where(game => game.Id == parsedGameId)
            .Select(game => new { game.Player1DeckId, game.Player2DeckId })
            .SingleOrDefaultAsync();

        if (deckAssignments is null)
        {
            return Error.NotFound(code: "Game.NotFound", description: $"Game instance '{gameId}' was not found.");
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

    public ErrorOr<GameInstance> GetById(string gameId)
    {
        if (string.IsNullOrWhiteSpace(gameId))
        {
            return Error.Validation(code: "Game.GetById.MissingId", description: "Game id is required.");
        }

        if (!registry.TryGet(gameId, out var game) || game is null)
        {
            return Error.NotFound(code: "Game.NotFound", description: $"Game instance '{gameId}' was not found.");
        }

        return game;
    }

    public ErrorOr<GameInstance> Join(string gameId, JoinGameInstanceRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        return ExecuteRegistryOperation(
            operationName: "Game.Join",
            operation: () => registry.Join(gameId, request.Player));
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

}