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

        // The table's modifiers are validated before anything is loaded: a host who asks for a rule this deployment
        // does not know must be told, not quietly hosted a different game.
        if (!GameModifierKeys.TryNormalize(request.Modifiers, out var modifiers, out var unknownModifier))
        {
            return Error.Validation(
                code: "Game.CreateForUser.UnknownModifier",
                description: $"Unknown game modifier '{unknownModifier}'. Known modifiers: {GameModifierKeys.AllowedList}.");
        }

        var playerDeckResult = await gameReadService.ResolvePlayerDeckData(request.UserId, request.DeckId, operationName: "Game.CreateForUser");
        if (playerDeckResult.IsError)
        {
            return playerDeckResult.Errors;
        }

        var playerDeck = playerDeckResult.Value;

        // A game created for an invite carries its format, so the people the code is shared with are admitted by
        // the same rule set the creator saw. Creating without a format leaves the game unbound, as before.
        var rulesetBindingResult = await ResolveCreateRulesetBindingAsync(request.RulesetId, playerDeck);
        if (rulesetBindingResult.IsError)
        {
            return rulesetBindingResult.Errors;
        }

        await TouchGuestAsync(request.UserId);

        try
        {
            var gameInstance = registry.Create(
                [playerDeck.Player],
                playerDeck.CardDefinitions,
                preferredGameCode,
                modifiers: modifiers);
            gameInstance.Ruleset = rulesetBindingResult.Value;
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

        // A bound game carries its format with it - a quick match, or an invite created under a format - so joining
        // by code is admission-checked against exactly the rules its creator saw. Unbound games admit anyone.
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

    /// <summary>
    /// Judges the creator's deck against the format the game will be bound to before the game exists, then hands
    /// back the binding to stamp on it. No format requested means no binding and no extra validation.
    /// </summary>
    private async Task<ErrorOr<GameRulesetBinding?>> ResolveCreateRulesetBindingAsync(
        Guid? rulesetId,
        ResolvedPlayerDeck deck)
    {
        if (rulesetId is null || rulesetId.Value == Guid.Empty)
        {
            return (GameRulesetBinding?)null;
        }

        if (deckRulesetService is null || deckValidator is null)
        {
            // Composition used by the engine tests does not register the ruleset services; those tests never ask
            // for a bound game either, so this only guards a misconfigured deployment.
            return (GameRulesetBinding?)null;
        }

        var definitionResult = await deckRulesetService.GetActiveRulesetDefinition(rulesetId.Value);
        if (definitionResult.IsError)
        {
            return definitionResult.Errors;
        }

        var definition = definitionResult.Value;

        var evaluation = deckValidator.Validate(deck, definition);
        if (evaluation.IsError)
        {
            return evaluation.Errors;
        }

        // The clock policy is snapshotted with the binding: the ruleset may be edited later, but a game that has
        // already started must keep the timings its players agreed to.
        return new GameRulesetBinding(definition.Id, definition.Key, definition.Name, definition.Clock);
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
