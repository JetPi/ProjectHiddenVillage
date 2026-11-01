using ErrorOr;
using ProjectHiddenVillage.Server.Api.Interfaces.Deck;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Interfaces.User;
using ProjectHiddenVillage.Server.Api.Services.Maintenance;
using ProjectHiddenVillage.Server.Api.Services.Rematch;

namespace ProjectHiddenVillage.Server;

public sealed class GameInstanceService(
    InMemoryGameInstanceRegistry registry,
    IGameReadService gameReadService,
    IDeckRulesetService? deckRulesetService = null,
    IGameRulesetDeckValidator? deckValidator = null,
    IGuestUserService? guestUserService = null,
    IRematchHandlingService? rematchHandlingService = null,
    MaintenanceState? maintenanceState = null) : IGameInstanceService
{
    public Task<ErrorOr<GameInstance>> CreateGameForUser(CreateGameForUserRequest request)
    {
        return CreateGameForUser(request, preferredGameCode: null);
    }

    public async Task<ErrorOr<GameInstance>> CreateGameForUser(CreateGameForUserRequest request, string? preferredGameCode)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (BlockedByMaintenance() is { } blocked)
        {
            return blocked;
        }

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
            // Hosting a new table is the player saying where they went: any rematch they were still holding is over.
            rematchHandlingService?.ReleaseReservationsForPlayer(request.UserId.ToString("N"));
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
            // A code with no table yet may still be a rematch reservation: the two players agreed on another match
            // and each is coming back from the login view with the deck they chose. Opening the table here is what
            // turns that reservation into a game, so maintenance refuses it like any other new table.
            if (BlockedByMaintenance() is { } blockedClaim)
            {
                return blockedClaim;
            }

            return await ClaimReservedRematchTableAsync(normalizedGameCode, request);
        }

        var joinResult = await JoinExistingGameAsync(game, normalizedGameCode, request);
        CompleteRematchReservationIfStarted(joinResult, normalizedGameCode);

        if (!joinResult.IsError)
        {
            // Joining another table means they moved on. The code they just joined is excluded: claiming a rematch
            // seat is not moving on from that rematch.
            rematchHandlingService?.ReleaseReservationsForPlayer(
                request.UserId.ToString("N"),
                exceptGameCode: normalizedGameCode);
        }

        return joinResult;
    }

    /// <summary>
    /// Joins a table that already exists. A bound game carries its format with it - a quick match, or an invite
    /// created under a format - so joining by code is admission-checked against exactly the rules its creator saw.
    /// Unbound games admit anyone.
    /// </summary>
    private async Task<ErrorOr<GameInstance>> JoinExistingGameAsync(
        GameInstance game,
        string gameCode,
        JoinGameAsPlayer request)
    {
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

        // A player already seated is admitted above: maintenance stops new seats, not a reload of a running game.
        if (BlockedByMaintenance() is { } blockedJoin)
        {
            return blockedJoin;
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

        var rulesetResult = await EnsureDeckMatchesGameRulesetAsync(game.Ruleset, playerDeck);
        if (rulesetResult.IsError)
        {
            return rulesetResult.Errors;
        }

        await TouchGuestAsync(request.UserId);

        try
        {
            var gameInstance = registry.Join(gameCode, playerDeck.Player, playerDeck.CardDefinitions);
            OpeningSupportCardSeeding(gameInstance, playerDeck.Player.Id, request.DeckId.Value);
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
    /// Seats a player in a table that was reserved by a rematch agreement. The first claim opens the table under the
    /// reserved code, inheriting the previous match's ruleset binding, clock policy and modifiers; the second claim
    /// joins it through the ordinary path. Both happen under the reservation's own lock, because the two claim
    /// requests can arrive from two browsers at the same instant and both would otherwise think they were first.
    /// </summary>
    private async Task<ErrorOr<GameInstance>> ClaimReservedRematchTableAsync(
        string gameCode,
        JoinGameAsPlayer request)
    {
        if (rematchHandlingService is null)
        {
            return Error.NotFound(
                code: "Game.JoinForUser.NotFound",
                description: $"Game instance '{gameCode}' was not found.");
        }

        // Claiming cancels any release either seat asked for: the agreement is being acted on, whoever got here
        // first. A release that already landed answers Game.Rematch.Released and the player is told the opponent left.
        var reservationResult = rematchHandlingService.GetActiveReservation(
            gameCode,
            request.UserId.ToString("N"),
            cancelsPendingRelease: true);

        if (reservationResult.IsError)
        {
            return reservationResult.Errors;
        }

        var reservation = reservationResult.Value;
        var playerId = request.UserId.ToString("N");

        if (!reservation.HasSeat(playerId))
        {
            return Error.Unauthorized(
                code: "Game.Rematch.Forbidden",
                description: "This rematch table is reserved for the two players of the previous match.");
        }

        if (!request.DeckId.HasValue || request.DeckId.Value == Guid.Empty)
        {
            return Error.Validation(code: "Game.JoinForUser.MissingDeckId", description: "DeckId is required.");
        }

        await reservation.ClaimLock.WaitAsync();

        try
        {
            // The opponent waited here and opened the table first: this claim is then just a join.
            if (registry.TryGet(gameCode, out var openedTable) && openedTable is not null)
            {
                var joinResult = await JoinExistingGameAsync(openedTable, gameCode, request);
                CompleteRematchReservationIfStarted(joinResult, gameCode);
                return joinResult;
            }

            var playerDeckResult = await gameReadService.ResolvePlayerDeckData(
                request.UserId,
                request.DeckId.Value,
                operationName: "Game.Rematch.Claim");

            if (playerDeckResult.IsError)
            {
                return playerDeckResult.Errors;
            }

            var playerDeck = playerDeckResult.Value;

            // The decks are judged against the live definition of the format the previous match was played in: the
            // rematch cannot change the ruleset, and a changed deck still has to fit it.
            var rulesetResult = await EnsureDeckMatchesReservedRulesetAsync(reservation, playerDeck);
            if (rulesetResult.IsError)
            {
                return rulesetResult.Errors;
            }

            await TouchGuestAsync(request.UserId);

            try
            {
                var gameInstance = registry.CreateWithReservedCode(
                    [playerDeck.Player],
                    playerDeck.CardDefinitions,
                    gameCode,
                    modifiers: reservation.Modifiers.Count == 0 ? null : reservation.Modifiers);

                if (reservation.Ruleset is { } binding)
                {
                    gameInstance.Ruleset = binding;
                }

                OpeningSupportCardSeeding(gameInstance, playerDeck.Player.Id, request.DeckId.Value);
                return gameInstance;
            }
            catch (ArgumentException ex)
            {
                return Error.Validation(code: "Game.Rematch.InvalidRequest", description: ex.Message);
            }
            catch (InvalidOperationException ex)
            {
                return Error.Validation(code: "Game.Rematch.InvalidState", description: ex.Message);
            }
        }
        finally
        {
            reservation.ClaimLock.Release();
        }
    }

    /// <summary>The reservation has done its job once both seats are filled: the table holds the code from then on.</summary>
    private void CompleteRematchReservationIfStarted(ErrorOr<GameInstance> joinResult, string gameCode)
    {
        if (rematchHandlingService is null || joinResult.IsError)
        {
            return;
        }

        if (joinResult.Value.State.Players.Count >= 2)
        {
            rematchHandlingService.CompleteReservation(gameCode);
        }
    }

    private static void OpeningSupportCardSeeding(GameInstance gameInstance, string playerId, Guid deckId)
    {
        OpeningSupportSeeding.EnsureSupportCardSeededIntoOpeningDrawWindow(gameInstance, playerId, deckId);
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

    /// <summary>
    /// The same judgement a join gets, against the format the rematch was agreed in. An unbound source table has no
    /// format to check, and a format that has since been deactivated refuses the rematch instead of quietly playing
    /// a game under rules nobody can look up any more.
    /// </summary>
    private async Task<ErrorOr<Success>> EnsureDeckMatchesReservedRulesetAsync(
        RematchReservation reservation,
        ResolvedPlayerDeck deck)
    {
        if (reservation.Ruleset is null)
        {
            return Result.Success;
        }

        if (deckRulesetService is null || deckValidator is null)
        {
            return Result.Success;
        }

        var definitionResult = await deckRulesetService.GetActiveRulesetDefinition(reservation.Ruleset.Id);
        if (definitionResult.IsError)
        {
            return Error.Validation(
                code: "Game.Rematch.RulesetUnavailable",
                description: $"The format '{reservation.Ruleset.Name}' is no longer available, so this rematch cannot start.");
        }

        var evaluation = deckValidator.Validate(deck, definitionResult.Value);
        return evaluation.IsError ? evaluation.Errors : Result.Success;
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

    private Error? BlockedByMaintenance()
    {
        return MaintenanceGate.BlockedError(maintenanceState);
    }

    private static bool HasStoredDeck(PlayerState playerState)
    {
        return playerState.Deck.Any(card => !string.IsNullOrWhiteSpace(card.CardDefinitionId));
    }
}
