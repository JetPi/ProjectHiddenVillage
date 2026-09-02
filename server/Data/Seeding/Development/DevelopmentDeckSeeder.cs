using Microsoft.EntityFrameworkCore;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Data.Seeding.Development;

public sealed class DevelopmentDeckSeeder
{
    public static readonly Guid DefaultDeckOneId = Guid.Parse("10000000-0000-0000-0000-000000000001");
    public static readonly Guid DefaultDeckTwoId = Guid.Parse("10000000-0000-0000-0000-000000000002");
    public static readonly Guid SummonRequirementsDeckOneId = Guid.Parse("10000000-0000-0000-0000-000000000101");
    public static readonly Guid SummonRequirementsDeckTwoId = Guid.Parse("10000000-0000-0000-0000-000000000102");

    private static readonly HashSet<string> PlaceholderLeaderCardIds =
    [
        "N-001",
        "N-012",
        "T-001"
    ];

    // Keep deterministic support metadata for known support-capable cards even
    // when development placeholder entries are used.
    private static readonly HashSet<string> PlaceholderSupportCapableCardIds =
    [
        "N-008",
        "N-015"
    ];

    private static readonly IReadOnlyList<SeedDeckSuiteDefinition> SeedDeckSuites =
    [
        new SeedDeckSuiteDefinition(
            SuiteKey: "default",
            Decks:
            [
                new SeedDeckDefinition(
                    DeckId: DefaultDeckOneId,
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
                    DeckId: DefaultDeckTwoId,
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
            ]),
        new SeedDeckSuiteDefinition(
            SuiteKey: "summon-requirements",
            Decks:
            [
                new SeedDeckDefinition(
                    DeckId: SummonRequirementsDeckOneId,
                    Type: DeckType.Public,
                    Cards:
                    [
                        new SeedDeckCardDefinition("T-001", 1),
                        new SeedDeckCardDefinition("T-100", 3),
                        new SeedDeckCardDefinition("T-900", 3)
                    ]),
                new SeedDeckDefinition(
                    DeckId: SummonRequirementsDeckTwoId,
                    Type: DeckType.Public,
                    Cards:
                    [
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
        await EnsureSuiteSpecificCatalogEntriesAsync(cancellationToken);

        foreach (var seedDeck in SeedDeckSuites.SelectMany(suite => suite.Decks))
        {
            var existingDeck = await dbContext.Decks
                .SingleOrDefaultAsync(deck => deck.Id == seedDeck.DeckId, cancellationToken);

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
                .Select(entry => new { entry.Id, entry.CardId, entry.Type })
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
                await SeedPlaceholderCatalogEntriesAsync(missingCardIds, cancellationToken);

                catalogEntries = await dbContext.CardCatalogEntries
                    .AsNoTracking()
                    .Where(entry => requestedCardIds.Contains(entry.CardId.ToUpper()))
                    .Select(entry => new { entry.Id, entry.CardId, entry.Type })
                    .ToListAsync(cancellationToken);

                catalogByCardId = catalogEntries.ToDictionary(
                    keySelector: entry => entry.CardId.ToUpperInvariant(),
                    elementSelector: entry => entry.Id,
                    comparer: StringComparer.Ordinal);

                missingCardIds = requestedCardIds
                    .Where(cardId => !catalogByCardId.ContainsKey(cardId))
                    .OrderBy(cardId => cardId, StringComparer.Ordinal)
                    .ToList();

                if (missingCardIds.Count > 0)
                {
                    logger.LogWarning(
                        "Skipping seed deck {DeckId}. Unknown card id(s) remained after placeholder seed attempt: {MissingCardIds}",
                        seedDeck.DeckId,
                        string.Join(", ", missingCardIds));
                    continue;
                }
            }

            var prohibitedCardIds = catalogEntries
                .Where(entry => entry.Type is CardType.Chakra or CardType.Summon)
                .Select(entry => entry.CardId)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(cardId => cardId, StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (prohibitedCardIds.Count > 0)
            {
                logger.LogWarning(
                    "Skipping seed deck {DeckId}. Non-deckable card type(s) found for card id(s): {CardIds}",
                    seedDeck.DeckId,
                    string.Join(", ", prohibitedCardIds));
                continue;
            }

            if (existingDeck is null)
            {
                var newDeck = new Deck
                {
                    Id = seedDeck.DeckId,
                    Type = seedDeck.Type,
                    UserId = null,
                };

                dbContext.Decks.Add(newDeck);
                existingDeck = newDeck;
            }

            existingDeck.Type = seedDeck.Type;
            existingDeck.UserId = null;

            var existingDeckCards = await dbContext.DeckCards
                .Where(deckCard => deckCard.DeckId == existingDeck.Id)
                .ToListAsync(cancellationToken);

            if (existingDeckCards.Count > 0)
            {
                dbContext.DeckCards.RemoveRange(existingDeckCards);
            }

            dbContext.DeckCards.AddRange(normalizedCards.Select(card => new DeckCard
            {
                DeckId = existingDeck.Id,
                CardCatalogEntryId = catalogByCardId[card.CardId.Trim().ToUpperInvariant()],
                Quantity = card.Quantity
            }));

            await dbContext.SaveChangesAsync(cancellationToken);

            logger.LogInformation(
                "Synchronized development deck {DeckId} with {CardCount} card rows.",
                existingDeck.Id,
                normalizedCards.Count);
        }
    }

    private async Task EnsureSuiteSpecificCatalogEntriesAsync(CancellationToken cancellationToken)
    {
        var entries = CreateSuiteSpecificCatalogEntries();
        foreach (var entry in entries)
        {
            var normalizedCardId = entry.CardId.Trim().ToUpperInvariant();
            var existingEntry = await dbContext.CardCatalogEntries
                .SingleOrDefaultAsync(card => card.CardId.ToUpper() == normalizedCardId, cancellationToken);

            if (existingEntry is null)
            {
                dbContext.CardCatalogEntries.Add(entry);
                continue;
            }

            existingEntry.Image = entry.Image;
            existingEntry.OriginalId = entry.OriginalId;
            existingEntry.MainAlternate = entry.MainAlternate;
            existingEntry.Attribute = entry.Attribute;
            existingEntry.DisplayName = entry.DisplayName;
            existingEntry.Type = entry.Type;
            existingEntry.Color = entry.Color;
            existingEntry.Description = entry.Description;
            existingEntry.Damage = entry.Damage;
            existingEntry.Power = entry.Power;
            existingEntry.NameJson = entry.NameJson;
            existingEntry.TraitsJson = entry.TraitsJson;
            existingEntry.ConditionsJson = entry.ConditionsJson;
            existingEntry.EffectsJson = entry.EffectsJson;
            existingEntry.Life = entry.Life;
            existingEntry.Health = entry.Health;
            existingEntry.CannotBeNormalSummoned = entry.CannotBeNormalSummoned;
            existingEntry.SupportName = entry.SupportName;
            existingEntry.SupportEffect = entry.SupportEffect;
            existingEntry.UpdatedAtUtc = entry.UpdatedAtUtc;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private static IReadOnlyList<CardCatalogEntry> CreateSuiteSpecificCatalogEntries()
    {
        var utcNow = DateTimeOffset.UtcNow;

        return
        [
            new CardCatalogEntry
            {
                CardId = "T-001",
                OriginalId = "T-001",
                DisplayName = "Training Commander",
                Image = "https://example.com/cards/T-001.webp",
                Type = CardType.Leader,
                Color = CardColor.Blue,
                Description = "Development leader for summon requirement suite.",
                NameJson = "[\"Training Commander\"]",
                TraitsJson = "[\"Leader\"]",
                ConditionsJson = "[]",
                EffectsJson = "[]",
                Damage = 0,
                Power = 0,
                Life = 5,
                Health = null,
                SupportName = string.Empty,
                SupportEffect = string.Empty,
                MainAlternate = false,
                CannotBeNormalSummoned = false,
                CreatedAtUtc = utcNow,
                UpdatedAtUtc = utcNow,
            },
            new CardCatalogEntry
            {
                CardId = "T-100",
                OriginalId = "T-100",
                DisplayName = "Academy Adept",
                Image = "https://example.com/cards/T-100.webp",
                Type = CardType.Character,
                Color = CardColor.Blue,
                Description = "Development tribute material for summon requirement suite.",
                NameJson = "[\"Academy Adept\"]",
                TraitsJson = "[\"Shinobi\"]",
                ConditionsJson = "[]",
                EffectsJson = "[]",
                Damage = 1,
                Power = 2,
                Life = null,
                Health = 2,
                SupportName = string.Empty,
                SupportEffect = string.Empty,
                MainAlternate = false,
                CannotBeNormalSummoned = false,
                CreatedAtUtc = utcNow,
                UpdatedAtUtc = utcNow,
            },
            new CardCatalogEntry
            {
                CardId = "T-900",
                OriginalId = "T-900",
                DisplayName = "Ancient Toad Sage",
                Image = "https://example.com/cards/T-900.webp",
                Type = CardType.Character,
                Color = CardColor.Green,
                Description = "[Summon Requirements] Select 1 of your characters in the field and send it to the trash to summon this card.",
                NameJson = "[\"Ancient Toad Sage\"]",
                TraitsJson = "[\"Toad\",\"Sage\"]",
                ConditionsJson = "[\"Summon Requirements\"]",
                EffectsJson = "[{\"id\":\"summon-requirement-tribute\",\"runtimeEffectType\":\"Tribute\",\"effectType\":\"Activated\",\"timing\":\"ActivateMain\",\"targetRules\":{\"tributeComposition\":{\"exactTributeCount\":1,\"requireSingleSummonTarget\":false,\"requireDistinctSummonAndTributes\":true},\"rules\":[{\"scope\":\"Self\",\"inZone\":\"CharacterField\",\"tributeRole\":\"TributeMaterial\",\"exactSelectedTargetCount\":1,\"restriction\":{\"predicates\":[],\"matchMode\":\"Any\"}}]}}]",
                Damage = 3,
                Power = 5,
                Life = null,
                Health = 5,
                SupportName = string.Empty,
                SupportEffect = string.Empty,
                MainAlternate = false,
                CannotBeNormalSummoned = true,
                CreatedAtUtc = utcNow,
                UpdatedAtUtc = utcNow,
            }
        ];
    }

    private async Task SeedPlaceholderCatalogEntriesAsync(
        IReadOnlyList<string> missingCardIds,
        CancellationToken cancellationToken)
    {
        if (missingCardIds.Count == 0)
        {
            return;
        }

        var utcNow = DateTimeOffset.UtcNow;

        foreach (var cardId in missingCardIds)
        {
            var normalizedCardId = cardId.Trim().ToUpperInvariant();
            if (string.IsNullOrWhiteSpace(normalizedCardId))
            {
                continue;
            }

            if (await dbContext.CardCatalogEntries
                .AsNoTracking()
                .AnyAsync(entry => entry.CardId.ToUpper() == normalizedCardId, cancellationToken))
            {
                continue;
            }

            var isLeader = PlaceholderLeaderCardIds.Contains(normalizedCardId);
            var isSupportCapablePlaceholder = PlaceholderSupportCapableCardIds.Contains(normalizedCardId);

            dbContext.CardCatalogEntries.Add(new CardCatalogEntry
            {
                CardId = normalizedCardId,
                OriginalId = normalizedCardId,
                DisplayName = normalizedCardId,
                Image = $"https://example.com/cards/{normalizedCardId}.webp",
                Type = isLeader ? CardType.Leader : CardType.Character,
                Color = CardColor.NotApplicable,
                Description = "Development placeholder card entry for deterministic local and CI seeding.",
                NameJson = $"[\"{normalizedCardId}\"]",
                TraitsJson = "[]",
                ConditionsJson = "[]",
                EffectsJson = "[]",
                Damage = 0,
                Power = 0,
                Life = isLeader ? 15 : null,
                Health = isLeader ? null : 1,
                SupportName = isSupportCapablePlaceholder ? "Support Placeholder" : string.Empty,
                SupportEffect = isSupportCapablePlaceholder
                    ? "Development seed support effect placeholder for deterministic CI and local tests."
                    : string.Empty,
                MainAlternate = false,
                CannotBeNormalSummoned = false,
                CreatedAtUtc = utcNow,
                UpdatedAtUtc = utcNow,
            });
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        logger.LogWarning(
            "Seeded placeholder catalog entries for missing development deck card ids: {CardIds}",
            string.Join(", ", missingCardIds));
    }

    private sealed record SeedDeckSuiteDefinition(
        string SuiteKey,
        IReadOnlyList<SeedDeckDefinition> Decks);

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