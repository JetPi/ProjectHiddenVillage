using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Data.Seeding.Development;

public sealed class DevelopmentDeckSeeder
{
    private const string SeedProfilesRelativePath = "../test-data/seed-profiles.json";

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

    private static readonly JsonSerializerOptions SeedManifestSerializerOptions = CreateSeedManifestSerializerOptions();

    private readonly ApplicationDbContext dbContext;
    private readonly ILogger<DevelopmentDeckSeeder> logger;
    private readonly string contentRootPath;

    public DevelopmentDeckSeeder(
        ApplicationDbContext dbContext,
        ILogger<DevelopmentDeckSeeder> logger,
        IWebHostEnvironment environment)
    {
        this.dbContext = dbContext;
        this.logger = logger;
        contentRootPath = environment.ContentRootPath;
    }

    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        var seedManifest = LoadSeedManifest();

        await EnsureSuiteSpecificCatalogEntriesAsync(seedManifest.CatalogEntries, cancellationToken);

        foreach (var seedDeck in seedManifest.Profiles.SelectMany(profile => new[]
                 {
                     ToSeedDeckDefinition(profile.Decks.One),
                     ToSeedDeckDefinition(profile.Decks.Two),
                 }))
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

    private async Task EnsureSuiteSpecificCatalogEntriesAsync(
        IReadOnlyList<SeedCatalogEntryDefinition> entries,
        CancellationToken cancellationToken)
    {
        foreach (var entry in entries)
        {
            var normalizedCardId = entry.CardId.Trim().ToUpperInvariant();
            var existingEntry = await dbContext.CardCatalogEntries
                .SingleOrDefaultAsync(card => card.CardId.ToUpper() == normalizedCardId, cancellationToken);

            var mappedEntry = ToCardCatalogEntry(entry);

            if (existingEntry is null)
            {
                dbContext.CardCatalogEntries.Add(mappedEntry);
                continue;
            }

            existingEntry.Image = mappedEntry.Image;
            existingEntry.OriginalId = mappedEntry.OriginalId;
            existingEntry.MainAlternate = mappedEntry.MainAlternate;
            existingEntry.Attribute = mappedEntry.Attribute;
            existingEntry.DisplayName = mappedEntry.DisplayName;
            existingEntry.Type = mappedEntry.Type;
            existingEntry.Color = mappedEntry.Color;
            existingEntry.Description = mappedEntry.Description;
            existingEntry.Damage = mappedEntry.Damage;
            existingEntry.Power = mappedEntry.Power;
            existingEntry.NameJson = mappedEntry.NameJson;
            existingEntry.TraitsJson = mappedEntry.TraitsJson;
            existingEntry.ConditionsJson = mappedEntry.ConditionsJson;
            existingEntry.EffectsJson = mappedEntry.EffectsJson;
            existingEntry.Life = mappedEntry.Life;
            existingEntry.Health = mappedEntry.Health;
            existingEntry.CannotBeNormalSummoned = mappedEntry.CannotBeNormalSummoned;
            existingEntry.SupportName = mappedEntry.SupportName;
            existingEntry.SupportEffect = mappedEntry.SupportEffect;
            existingEntry.UpdatedAtUtc = mappedEntry.UpdatedAtUtc;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private SeedManifestDefinition LoadSeedManifest()
    {
        var manifestPath = Path.GetFullPath(Path.Combine(contentRootPath, SeedProfilesRelativePath));
        if (!File.Exists(manifestPath))
        {
            throw new InvalidOperationException($"Seed manifest '{manifestPath}' was not found.");
        }

        var json = File.ReadAllText(manifestPath);
        var manifest = JsonSerializer.Deserialize<SeedManifestDefinition>(json, SeedManifestSerializerOptions);
        if (manifest is null)
        {
            throw new InvalidOperationException("Seed manifest could not be parsed.");
        }

        return manifest;
    }

    private static JsonSerializerOptions CreateSeedManifestSerializerOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        options.Converters.Add(new Api.Serialization.FlexibleEnumJsonConverterFactory());
        return options;
    }

    private static SeedDeckDefinition ToSeedDeckDefinition(SeedDeckManifest manifestDeck)
    {
        return new SeedDeckDefinition(
            DeckId: Guid.Parse(manifestDeck.DeckId),
            Type: DeckType.Public,
            Cards: manifestDeck.Cards.Select(card => new SeedDeckCardDefinition(card.CardId, card.Quantity)).ToList());
    }

    private static CardCatalogEntry ToCardCatalogEntry(SeedCatalogEntryDefinition definition)
    {
        var utcNow = DateTimeOffset.UtcNow;
        return new CardCatalogEntry
        {
            CardId = definition.CardId,
            OriginalId = definition.OriginalId,
            DisplayName = definition.DisplayName,
            Image = definition.Image,
            Type = definition.Type,
            Color = definition.Color,
            Description = definition.Description,
            NameJson = JsonSerializer.Serialize(definition.Name),
            TraitsJson = JsonSerializer.Serialize(definition.Traits),
            ConditionsJson = JsonSerializer.Serialize(definition.Conditions),
            EffectsJson = JsonSerializer.Serialize(definition.Effects, SeedManifestSerializerOptions),
            Damage = definition.Damage,
            Power = definition.Power,
            Life = definition.Life,
            Health = definition.Health,
            SupportName = definition.SupportName,
            SupportEffect = definition.SupportEffect,
            MainAlternate = definition.MainAlternate,
            CannotBeNormalSummoned = definition.CannotBeNormalSummoned,
            CreatedAtUtc = utcNow,
            UpdatedAtUtc = utcNow,
        };
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

    private sealed record SeedDeckDefinition(
        Guid DeckId,
        DeckType Type,
        IReadOnlyList<SeedDeckCardDefinition> Cards);

    private sealed record SeedDeckCardDefinition(string CardId, int Quantity);

    private sealed record SeedManifestDefinition(
        IReadOnlyList<SeedProfileDefinition> Profiles,
        IReadOnlyList<SeedCatalogEntryDefinition> CatalogEntries);

    private sealed record SeedProfileDefinition(
        string Name,
        SeedDeckPairManifest Decks);

    private sealed record SeedDeckPairManifest(
        SeedDeckManifest One,
        SeedDeckManifest Two);

    private sealed record SeedDeckManifest(
        string DeckId,
        IReadOnlyList<SeedCardManifest> Cards);

    private sealed record SeedCardManifest(string CardId, int Quantity);

    private sealed record SeedCatalogEntryDefinition(
        string CardId,
        string OriginalId,
        string DisplayName,
        string Image,
        CardType Type,
        CardColor Color,
        string Description,
        IReadOnlyList<string> Name,
        IReadOnlyList<string> Traits,
        IReadOnlyList<string> Conditions,
        IReadOnlyList<EffectSpec> Effects,
        int Damage,
        int Power,
        int? Life,
        int? Health,
        string SupportName,
        string SupportEffect,
        bool MainAlternate,
        bool CannotBeNormalSummoned);

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