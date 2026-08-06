using Microsoft.EntityFrameworkCore;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Data.Seeding.Development;

public sealed class DevelopmentDeckSeeder
{
    private static readonly Guid SeedDeckOneId = Guid.Parse("10000000-0000-0000-0000-000000000001");
    private static readonly Guid SeedDeckTwoId = Guid.Parse("10000000-0000-0000-0000-000000000002");

    private static readonly IReadOnlyList<SeedDeckDefinition> SeedDecks =
    [
        new SeedDeckDefinition(
            DeckId: SeedDeckOneId,
            Type: DeckType.Public,
            Cards:
            [
                new SeedDeckCardDefinition("N-001", 1),
                new SeedDeckCardDefinition("N-002", 3),
                new SeedDeckCardDefinition("N-003", 3),
                new SeedDeckCardDefinition("N-004", 3),
                new SeedDeckCardDefinition("N-005", 3),
                new SeedDeckCardDefinition("N-006", 3),
                new SeedDeckCardDefinition("N-007", 3),
                new SeedDeckCardDefinition("N-008", 3),
                new SeedDeckCardDefinition("N-009", 3),
                new SeedDeckCardDefinition("N-011", 3),
                new SeedDeckCardDefinition("N-018", 3)
            ]),
        new SeedDeckDefinition(
            DeckId: SeedDeckTwoId,
            Type: DeckType.Public,
            Cards:
            [
                new SeedDeckCardDefinition("N-010", 3),
                new SeedDeckCardDefinition("N-012", 1),
                new SeedDeckCardDefinition("N-013", 3),
                new SeedDeckCardDefinition("N-014", 3),
                new SeedDeckCardDefinition("N-015", 3),
                new SeedDeckCardDefinition("N-016", 3),
                new SeedDeckCardDefinition("N-017", 3),
                new SeedDeckCardDefinition("N-019", 3),
                new SeedDeckCardDefinition("N-020", 3),
                new SeedDeckCardDefinition("N-021", 3),
                new SeedDeckCardDefinition("N-022", 3)
            ])
    ];

    private readonly ApplicationDbContext dbContext;
    private readonly ILogger<DevelopmentDeckSeeder> logger;

    public DevelopmentDeckSeeder(ApplicationDbContext dbContext, ILogger<DevelopmentDeckSeeder> logger)
    {
        this.dbContext = dbContext;
        this.logger = logger;
    }

    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        foreach (var seedDeck in SeedDecks)
        {
            var alreadyExists = await dbContext.Decks
                .AsNoTracking()
                .AnyAsync(deck => deck.Id == seedDeck.DeckId, cancellationToken);

            if (alreadyExists)
            {
                logger.LogInformation("Skipping seed deck {DeckId} because it already exists.", seedDeck.DeckId);
                continue;
            }

            if (seedDeck.Cards.Count == 0)
            {
                logger.LogInformation(
                    "Skipping seed deck {DeckId} because no cards were configured yet.",
                    seedDeck.DeckId);
                continue;
            }

            var normalizeResult = NormalizeCards(seedDeck.Cards);
            if (normalizeResult.IsError)
            {
                logger.LogWarning(
                    "Skipping seed deck {DeckId}. {Reason}",
                    seedDeck.DeckId,
                    normalizeResult.ErrorDescription);
                continue;
            }

            var normalizedCards = normalizeResult.Cards;

            var requestedCardIds = normalizedCards
                .Select(card => card.CardId.Trim().ToUpperInvariant())
                .ToHashSet(StringComparer.Ordinal);

            var catalogEntries = await dbContext.CardCatalogEntries
                .AsNoTracking()
                .Where(entry => requestedCardIds.Contains(entry.CardId.ToUpper()))
                .Select(entry => new { entry.Id, entry.CardId })
                .ToListAsync(cancellationToken);

            var catalogByCardId = catalogEntries.ToDictionary(
                keySelector: entry => entry.CardId.ToUpperInvariant(),
                elementSelector: entry => entry.Id,
                comparer: StringComparer.Ordinal);

            var missingCardIds = requestedCardIds
                .Where(cardId => !catalogByCardId.ContainsKey(cardId))
                .OrderBy(cardId => cardId, StringComparer.Ordinal)
                .ToList();

            if (missingCardIds.Count > 0)
            {
                logger.LogWarning(
                    "Skipping seed deck {DeckId}. Unknown card id(s): {MissingCardIds}",
                    seedDeck.DeckId,
                    string.Join(", ", missingCardIds));
                continue;
            }

            var deck = new Deck
            {
                Id = seedDeck.DeckId,
                Type = seedDeck.Type,
                UserId = null,
                Cards = normalizedCards.Select(card => new DeckCard
                {
                    CardCatalogEntryId = catalogByCardId[card.CardId.Trim().ToUpperInvariant()],
                    Quantity = card.Quantity
                }).ToList()
            };

            dbContext.Decks.Add(deck);
            await dbContext.SaveChangesAsync(cancellationToken);

            logger.LogInformation(
                "Seeded development deck {DeckId} with {CardCount} card rows.",
                deck.Id,
                deck.Cards.Count);
        }
    }

    private sealed record SeedDeckDefinition(
        Guid DeckId,
        DeckType Type,
        IReadOnlyList<SeedDeckCardDefinition> Cards);

    private sealed record SeedDeckCardDefinition(string CardId, int Quantity);

    private static CardNormalizationResult NormalizeCards(IReadOnlyList<SeedDeckCardDefinition> cards)
    {
        var quantitiesByCardId = new Dictionary<string, int>(StringComparer.Ordinal);

        for (var index = 0; index < cards.Count; index++)
        {
            var card = cards[index];

            if (string.IsNullOrWhiteSpace(card.CardId))
            {
                return CardNormalizationResult.Failure($"Card row {index + 1} is missing a card id.");
            }

            if (card.Quantity <= 0)
            {
                return CardNormalizationResult.Failure(
                    $"Card row {index + 1} for '{card.CardId}' must have a positive quantity.");
            }

            var cardId = card.CardId.Trim().ToUpperInvariant();
            quantitiesByCardId.TryGetValue(cardId, out var existingQuantity);
            quantitiesByCardId[cardId] = existingQuantity + card.Quantity;
        }

        var normalizedCards = quantitiesByCardId
            .Select(pair => new SeedDeckCardDefinition(pair.Key, pair.Value))
            .ToList();

        if (normalizedCards.Count == 0)
        {
            return CardNormalizationResult.Failure("No valid cards were configured.");
        }

        return CardNormalizationResult.Success(normalizedCards);
    }

    private readonly record struct CardNormalizationResult(
        bool IsError,
        string ErrorDescription,
        IReadOnlyList<SeedDeckCardDefinition> Cards)
    {
        public static CardNormalizationResult Failure(string errorDescription) =>
            new(IsError: true, ErrorDescription: errorDescription, Cards: []);

        public static CardNormalizationResult Success(IReadOnlyList<SeedDeckCardDefinition> cards) =>
            new(IsError: false, ErrorDescription: string.Empty, Cards: cards);
    }
}