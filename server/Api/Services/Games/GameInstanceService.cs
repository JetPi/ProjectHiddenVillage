using ErrorOr;
using ProjectHiddenVillage.Server.Data;

namespace ProjectHiddenVillage.Server;

public sealed class GameInstanceService(
    InMemoryGameInstanceRegistry registry,
    IGameDeckResolverService deckResolverService) : IGameInstanceService
{
    public Task<ErrorOr<GameInstance>> CreateGameForUser(CreateGameForUserRequest request)
    {
        return CreateGameForUser(request, preferredGameCode: null);
    }

    public async Task<ErrorOr<GameInstance>> CreateGameForUser(CreateGameForUserRequest request, string? preferredGameCode)
    {
        ArgumentNullException.ThrowIfNull(request);

        var playerDeckResult = await deckResolverService.ResolvePlayerDeck(request.UserId, request.DeckId, operationName: "Game.CreateForUser");
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

        var playerDeckResult = await deckResolverService.ResolvePlayerDeck(request.UserId, request.DeckId.Value, operationName: "Game.JoinForUser");
        if (playerDeckResult.IsError)
        {
            return playerDeckResult.Errors;
        }

        var playerDeck = playerDeckResult.Value;
        try
        {
            return registry.Join(normalizedGameCode, playerDeck.Player, playerDeck.CardDefinitions);
        }
        catch (KeyNotFoundException ex)
        {
            return Error.NotFound(code: "Game.JoinForUser.NotFound", description: ex.Message);
        }
        catch (ArgumentException ex)
        {
            return Error.Validation(code: "Game.JoinForUser.InvalidRequest", description: ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            return Error.Validation(code: "Game.JoinForUser.InvalidState", description: ex.Message);
        }
    }

    private static bool HasStoredDeck(PlayerState playerState)
    {
        return playerState.Deck.Any(card => !string.IsNullOrWhiteSpace(card.CardDefinitionId));
    }
}
