namespace ProjectHiddenVillage.Server;

/// <summary>
/// Development-only nicety: the two seeded decks are shuffled so their opening draw window already holds a
/// support-capable card, which is what the demonstration scenarios assume. It lives on its own because every path
/// that builds a game instance - single-player create, join, and matchmaking - has to apply it identically.
/// </summary>
internal static class OpeningSupportSeeding
{
    private const int OpeningHandSize = 5;
    private const int MaxShuffleSeedAttempts = 8192;

    private static readonly HashSet<Guid> DevelopmentSeedDeckIds =
    [
        Guid.Parse("10000000-0000-0000-0000-000000000001"),
        Guid.Parse("10000000-0000-0000-0000-000000000002")
    ];

    internal static void EnsureSupportCardSeededIntoOpeningDrawWindow(GameInstance gameInstance, string playerId, Guid deckId)
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
