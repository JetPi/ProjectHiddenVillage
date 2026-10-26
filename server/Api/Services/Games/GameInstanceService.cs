using ErrorOr;
using ProjectHiddenVillage.Server.Api.Interfaces.Deck;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Interfaces.User;

namespace ProjectHiddenVillage.Server;

public sealed class GameInstanceService(
    InMemoryGameInstanceRegistry registry,
    IGameReadService gameReadService,
    IDeckRulesetService? deckRulesetService = null,
    IGameRulesetDeckValidator? deckValidator = null,
    IGuestUserService? guestUserService = null) : IGameInstanceService
{
    public Task<ErrorOr<GameInstance>> CreateGameForUser(CreateGameForUserRequest request)
    {
        return CreateGameForUser(request, preferredGameCode: null);
    }

    public async Task<ErrorOr<GameInstance>> CreateGameForUser(CreateGameForUserRequest request, string? preferredGameCode)
    {
        ArgumentNullException.ThrowIfNull(request);

        var playerDeckResult = await gameReadService.ResolvePlayerDeckData(request.UserId, request.DeckId, operationName: "Game.CreateForUser");
        if (playerDeckResult.IsError)
        {
            return playerDeckResult.Errors;
        }

        var playerDeck = playerDeckResult.Value;

        await TouchGuestAsync(request.UserId);

        try
        {
            var gameInstance = registry.Create([playerDeck.Player], playerDeck.CardDefinitions, preferredGameCode);
            OpeningSupportSeeding.EnsureSupportCardSeededIntoOpeningDrawWindow(gameInstance, playerDeck.Player.Id, request.DeckId);
            return gameInstance;
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

        var playerDeckResult = await gameReadService.ResolvePlayerDeckData(request.UserId, request.DeckId.Value, operationName: "Game.JoinForUser");
        if (playerDeckResult.IsError)
        {
            return playerDeckResult.Errors;
        }

        var playerDeck = playerDeckResult.Value;

        // A quick-match game carries its format with it, so joining by code is admission-checked against the same
        // rules the matchmaking queue enforced. Games created through the plain create mode carry no binding.
        var rulesetResult = await EnsureDeckMatchesGameRulesetAsync(game.Ruleset, playerDeck);
        if (rulesetResult.IsError)
        {
            return rulesetResult.Errors;
        }

        await TouchGuestAsync(request.UserId);

        try
        {
            var gameInstance = registry.Join(normalizedGameCode, playerDeck.Player, playerDeck.CardDefinitions);
            OpeningSupportSeeding.EnsureSupportCardSeededIntoOpeningDrawWindow(gameInstance, playerDeck.Player.Id, request.DeckId.Value);
            return gameInstance;
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

    private async Task<ErrorOr<Success>> EnsureDeckMatchesGameRulesetAsync(
        GameRulesetBinding? binding,
        ResolvedPlayerDeck deck)
    {
        if (binding is null)
        {
            return Result.Success;
        }

        if (deckRulesetService is null || deckValidator is null)
        {
            // Composition used by the engine tests does not register the ruleset services; there are no bound
            // games in those tests either, so this only guards a misconfigured deployment.
            return Result.Success;
        }

        var definitionResult = await deckRulesetService.GetActiveRulesetDefinition(binding.Id);
        if (definitionResult.IsError)
        {
            return definitionResult.Errors;
        }

        var evaluation = deckValidator.Validate(deck, definitionResult.Value);
        return evaluation.IsError ? evaluation.Errors : Result.Success;
    }

    /// <summary>
    /// Entering a game is a sign of life from a guest, and the retention window is measured from the last one.
    /// Writing is throttled inside the guest service, so an active guest costs one update every few minutes.
    /// </summary>
    private Task TouchGuestAsync(Guid userId)
    {
        return guestUserService is null
            ? Task.CompletedTask
            : guestUserService.TouchAsync(userId.ToString("N"));
    }

    private static bool HasStoredDeck(PlayerState playerState)
    {
        return playerState.Deck.Any(card => !string.IsNullOrWhiteSpace(card.CardDefinitionId));
    }
}
