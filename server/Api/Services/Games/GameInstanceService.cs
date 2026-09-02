using ErrorOr;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Data;

namespace ProjectHiddenVillage.Server;

public sealed class GameInstanceService(
    InMemoryGameInstanceRegistry registry,
    IGameReadService gameReadService) : IGameInstanceService
{
    private const int OpeningHandSize = 5;
    private const int MaxShuffleSeedAttempts = 8192;

    private static readonly HashSet<Guid> DevelopmentSeedDeckIds =
    [
        Guid.Parse("10000000-0000-0000-0000-000000000001"),
        Guid.Parse("10000000-0000-0000-0000-000000000002")
    ];

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

        try
        {
            var gameInstance = registry.Create([playerDeck.Player], playerDeck.CardDefinitions, preferredGameCode);
            EnsureSupportCardSeededIntoOpeningDrawWindow(gameInstance, playerDeck.Player.Id, request.DeckId);
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
        try
        {
            var gameInstance = registry.Join(normalizedGameCode, playerDeck.Player, playerDeck.CardDefinitions);
            EnsureSupportCardSeededIntoOpeningDrawWindow(gameInstance, playerDeck.Player.Id, request.DeckId.Value);
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

    private static bool HasStoredDeck(PlayerState playerState)
    {
        return playerState.Deck.Any(card => !string.IsNullOrWhiteSpace(card.CardDefinitionId));
    }

    private static void EnsureSupportCardSeededIntoOpeningDrawWindow(GameInstance gameInstance, string playerId, Guid deckId)
    {
        if (!DevelopmentSeedDeckIds.Contains(deckId))
        {
            return;
        }

        var playerState = gameInstance.State.Players
            .SingleOrDefault(player => string.Equals(player.PlayerId, playerId, StringComparison.Ordinal));

        if (playerState is null || playerState.Deck.Count == 0)
        {
            return;
        }

        var supportCardInstanceIds = playerState.Deck
            .Where(card => IsSupportCapableCard(gameInstance, card.CardDefinitionId))
            .Select(card => card.InstanceId)
            .ToHashSet(StringComparer.Ordinal);

        if (supportCardInstanceIds.Count == 0)
        {
            return;
        }

        var openingDrawWindow = Math.Min(OpeningHandSize, playerState.Deck.Count);
        if (ContainsSupportInOpeningWindow(playerState.Deck, supportCardInstanceIds, openingDrawWindow))
        {
            return;
        }

        var gameSeed = HashCode.Combine(gameInstance.State.GameSeed, playerId, deckId);
        var selectedSeed = FindOpeningSupportShuffleSeed(
            playerState.Deck,
            supportCardInstanceIds,
            openingDrawWindow,
            gameSeed);

        if (selectedSeed.HasValue)
        {
            GameDeckShuffle.Shuffle(playerState.Deck, new Random(selectedSeed.Value));
            return;
        }

        // Safety fallback: keep deterministic startup behavior even if no suitable seed was found.
        var supportCardIndex = playerState.Deck.FindIndex(card => supportCardInstanceIds.Contains(card.InstanceId));
        if (supportCardIndex <= 0)
        {
            return;
        }

        var supportCard = playerState.Deck[supportCardIndex];
        playerState.Deck.RemoveAt(supportCardIndex);
        playerState.Deck.Insert(0, supportCard);
    }

    private static int? FindOpeningSupportShuffleSeed(
        List<CardInstance> deck,
        HashSet<string> supportCardInstanceIds,
        int openingDrawWindow,
        int baseSeed)
    {
        for (var attempt = 0; attempt < MaxShuffleSeedAttempts; attempt++)
        {
            var candidateSeed = unchecked(baseSeed + (attempt * 7919));
            var candidateDeck = deck.ToList();
            GameDeckShuffle.Shuffle(candidateDeck, new Random(candidateSeed));

            if (ContainsSupportInOpeningWindow(candidateDeck, supportCardInstanceIds, openingDrawWindow))
            {
                return candidateSeed;
            }
        }

        return null;
    }

    private static bool ContainsSupportInOpeningWindow(
        List<CardInstance> deck,
        HashSet<string> supportCardInstanceIds,
        int openingDrawWindow)
    {
        return deck.Take(openingDrawWindow).Any(card => supportCardInstanceIds.Contains(card.InstanceId));
    }

    private static bool IsSupportCapableCard(GameInstance gameInstance, string cardDefinitionId)
    {
        if (!gameInstance.State.CardDefinitions.TryGetValue(cardDefinitionId, out var cardDefinition))
        {
            return false;
        }

        if (cardDefinition is not CharacterCard characterCard)
        {
            return false;
        }

        return !string.IsNullOrWhiteSpace(characterCard.SupportName)
            || !string.IsNullOrWhiteSpace(characterCard.SupportEffect);
    }
}
