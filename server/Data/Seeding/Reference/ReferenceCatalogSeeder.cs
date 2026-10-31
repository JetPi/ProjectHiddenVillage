using Microsoft.EntityFrameworkCore;

namespace ProjectHiddenVillage.Server.Data.Seeding.Reference;

/// <summary>
/// Seeds the card catalogue a deployment needs in order to be playable, and nothing else.
///
/// The Development seeders cannot do this job: they also create demo users, saved decks and in-flight games, and
/// they are gated behind <c>IsDevelopment()</c> precisely so those rows never reach a real database. A production
/// database that never seeds the catalogue, on the other hand, is a site that loads, shows the hub and then offers
/// no cards to build a deck from - which is what the first deployment of this app did.
///
/// So this is the deliberate half: catalogue rows only, inserted when missing, never written over. It runs when
/// <c>Database:SeedReferenceData=true</c>, in any environment.
/// </summary>
public sealed class ReferenceCatalogSeeder
{
    private readonly ApplicationDbContext dbContext;
    private readonly ILogger<ReferenceCatalogSeeder> logger;
    private readonly string contentRootPath;

    public ReferenceCatalogSeeder(
        ApplicationDbContext dbContext,
        ILogger<ReferenceCatalogSeeder> logger,
        IWebHostEnvironment environment)
    {
        this.dbContext = dbContext;
        this.logger = logger;
        contentRootPath = environment.ContentRootPath;
    }

    /// <summary>Inserts the manifest's cards that the database does not have yet. Returns how many were added.</summary>
    public async Task<int> SeedAsync(CancellationToken cancellationToken = default)
    {
        var definitions = CatalogManifest.LoadCatalogEntries(contentRootPath);

        // Compared upper-cased and in memory: the catalogue is small enough that a set beats a per-card round trip,
        // and the stored ids are compared the same way the rest of the app compares them.
        var storedCardIds = await dbContext.CardCatalogEntries
            .AsNoTracking()
            .Select(entry => entry.CardId)
            .ToListAsync(cancellationToken);

        var knownCardIds = storedCardIds
            .Select(cardId => cardId.Trim().ToUpperInvariant())
            .ToHashSet(StringComparer.Ordinal);

        var addedCardIds = new List<string>();

        foreach (var definition in definitions)
        {
            var normalizedCardId = definition.CardId.Trim().ToUpperInvariant();
            if (string.IsNullOrWhiteSpace(normalizedCardId) || !knownCardIds.Add(normalizedCardId))
            {
                continue;
            }

            // An existing card is not this seeder's business: authored artwork and effect patches live in those
            // rows, and startup must never revert them. Same rule the development seeder documents.
            dbContext.CardCatalogEntries.Add(CatalogManifest.ToCardCatalogEntry(definition));
            addedCardIds.Add(normalizedCardId);
        }

        if (addedCardIds.Count == 0)
        {
            logger.LogInformation(
                "Reference catalogue already holds all {Count} manifest cards; nothing to seed.",
                knownCardIds.Count);
            return 0;
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "Seeded {AddedCount} reference catalogue cards ({CardIds}). Existing rows were left untouched.",
            addedCardIds.Count,
            string.Join(", ", addedCardIds));

        return addedCardIds.Count;
    }
}
