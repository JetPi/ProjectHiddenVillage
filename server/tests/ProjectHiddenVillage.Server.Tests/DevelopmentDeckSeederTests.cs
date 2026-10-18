using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Data;
using ProjectHiddenVillage.Server.Data.Entities;
using ProjectHiddenVillage.Server.Data.Seeding.Development;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class DevelopmentDeckSeederTests
{
    private const string OverwriteExistingEntriesEnvironmentVariable = "PHV_RESEED_OVERWRITES_EXISTING";

    // N-008/N-015 always resolve from the seed manifest now, so this asserts the seeded support metadata rather
    // than the placeholder fallback the old test name referred to.
    [TestMethod]
    public async Task SeedAsync_SeedsSupportMetadata_ForN008AndN015_FromTheManifest()
    {
        await using var dbContext = CreateDbContext();
        await SeedRequiredUsersAsync(dbContext);

        var seeder = CreateSeeder(dbContext);
        await seeder.SeedAsync();

        var n008Catalog = await dbContext.CardCatalogEntries
            .AsNoTracking()
            .SingleAsync(entry => entry.CardId == "N-008");

        var n015Catalog = await dbContext.CardCatalogEntries
            .AsNoTracking()
            .SingleAsync(entry => entry.CardId == "N-015");

        Assert.AreEqual(CardType.Character, n008Catalog.Type);
        Assert.IsFalse(string.IsNullOrWhiteSpace(n008Catalog.SupportName));
        Assert.IsFalse(string.IsNullOrWhiteSpace(n008Catalog.SupportEffect));
        Assert.AreEqual(CardType.Character, n015Catalog.Type);
        Assert.IsFalse(string.IsNullOrWhiteSpace(n015Catalog.SupportName));
        Assert.IsFalse(string.IsNullOrWhiteSpace(n015Catalog.SupportEffect));

        var seededDeckOne = await dbContext.Decks
            .AsNoTracking()
            .Include(deck => deck.Cards)
            .ThenInclude(deckCard => deckCard.CardCatalogEntry)
            .SingleAsync(deck => deck.Id == Guid.Parse("10000000-0000-0000-0000-000000000001"));

        var seededDeckTwo = await dbContext.Decks
            .AsNoTracking()
            .Include(deck => deck.Cards)
            .ThenInclude(deckCard => deckCard.CardCatalogEntry)
            .SingleAsync(deck => deck.Id == Guid.Parse("10000000-0000-0000-0000-000000000002"));

        Assert.IsTrue(seededDeckOne.Cards.Count > 0);
        Assert.IsTrue(seededDeckTwo.Cards.Count > 0);
        Assert.IsTrue(seededDeckTwo.Cards.Any(card => card.CardCatalogEntry.CardId == "N-015"));
        Assert.IsFalse(seededDeckTwo.Cards.Any(card => card.CardCatalogEntry.CardId == "N-008"));
    }

    // Seeding runs on every start and creates what is missing - it never writes over a card that already
    // exists. Applying the manifest again is what reverted authored work at the next cold start (an uploaded
    // image went back to the source URL), so both shapes of stored row have to survive: one edited since it was
    // seeded, and one still carrying the seeded timestamps.
    [TestMethod]
    public async Task SeedAsync_KeepsStoredEntries_InsteadOfApplyingTheManifestAgain()
    {
        await using var dbContext = CreateDbContext();
        await SeedRequiredUsersAsync(dbContext);

        var seeder = CreateSeeder(dbContext);
        await seeder.SeedAsync();

        var authored = await dbContext.CardCatalogEntries.SingleAsync(entry => entry.CardId == "N-015");
        authored.Image = "local:card-art/N-015.webp";
        authored.SupportEffect = "authored in the admin";
        authored.UpdatedAtUtc = authored.CreatedAtUtc.AddMinutes(5);

        var stillFresh = await dbContext.CardCatalogEntries.SingleAsync(entry => entry.CardId == "N-008");
        stillFresh.Image = "https://stale.example.invalid/n-008.png";

        await dbContext.SaveChangesAsync();

        // A cold start.
        await seeder.SeedAsync();

        var persistedAuthored = await dbContext.CardCatalogEntries
            .AsNoTracking()
            .SingleAsync(entry => entry.CardId == "N-015");
        var persistedFresh = await dbContext.CardCatalogEntries
            .AsNoTracking()
            .SingleAsync(entry => entry.CardId == "N-008");

        Assert.AreEqual(
            "local:card-art/N-015.webp",
            persistedAuthored.Image,
            "an existing card must keep the art it points at");
        Assert.AreEqual("authored in the admin", persistedAuthored.SupportEffect);
        Assert.AreEqual(
            "https://stale.example.invalid/n-008.png",
            persistedFresh.Image,
            "seeding must not restore the manifest value even for a row that still looks freshly seeded");
    }

    // The override is the only path that writes over stored content, and it exists so a regenerated manifest can
    // still reach a database that already has the cards.
    [TestMethod]
    public async Task SeedAsync_OverwritesStoredEntries_WhenTheOverrideIsSet()
    {
        await using var dbContext = CreateDbContext();
        await SeedRequiredUsersAsync(dbContext);

        var seeder = CreateSeeder(dbContext);
        await seeder.SeedAsync();

        var seeded = await dbContext.CardCatalogEntries.SingleAsync(entry => entry.CardId == "N-015");
        var manifestImage = seeded.Image;
        seeded.Image = "local:card-art/N-015.webp";
        await dbContext.SaveChangesAsync();

        var previousOverride = Environment.GetEnvironmentVariable(OverwriteExistingEntriesEnvironmentVariable);
        Environment.SetEnvironmentVariable(OverwriteExistingEntriesEnvironmentVariable, "true");

        try
        {
            await seeder.SeedAsync();
        }
        finally
        {
            Environment.SetEnvironmentVariable(OverwriteExistingEntriesEnvironmentVariable, previousOverride);
        }

        var persisted = await dbContext.CardCatalogEntries
            .AsNoTracking()
            .SingleAsync(entry => entry.CardId == "N-015");

        Assert.AreEqual(manifestImage, persisted.Image);
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"development-deck-seeder-tests-{Guid.NewGuid()}")
            .Options;

        return new ApplicationDbContext(options);
    }

    // Seed only the minimum users required by DevelopmentDeckSeeder's deck write path.
    private static async Task SeedRequiredUsersAsync(ApplicationDbContext dbContext)
    {
        dbContext.Users.AddRange(
            new User
            {
                Id = DevelopmentUserSeeder.SeedUserOneId,
                Username = "user-1",
                Email = "user-1@test.local",
                PasswordHash = "hash-1",
            },
            new User
            {
                Id = DevelopmentUserSeeder.SeedUserTwoId,
                Username = "user-2",
                Email = "user-2@test.local",
                PasswordHash = "hash-2",
            });

        await dbContext.SaveChangesAsync();
    }

    private static DevelopmentDeckSeeder CreateSeeder(ApplicationDbContext dbContext)
    {
        var environment = new TestWebHostEnvironment
        {
            ContentRootPath = ResolveServerProjectRootPath(),
        };

        return new DevelopmentDeckSeeder(dbContext, NullLogger<DevelopmentDeckSeeder>.Instance, environment);
    }

    private static string ResolveServerProjectRootPath()
    {
        var current = new DirectoryInfo(AppContext.BaseDirectory);
        while (current is not null)
        {
            if (File.Exists(Path.Combine(current.FullName, "ProjectHiddenVillage.Server.csproj")))
            {
                return current.FullName;
            }

            current = current.Parent;
        }

        throw new InvalidOperationException("Unable to locate server project root containing ProjectHiddenVillage.Server.csproj.");
    }

    private sealed class TestWebHostEnvironment : IWebHostEnvironment
    {
        public string ApplicationName { get; set; } = string.Empty;
        public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
        public string WebRootPath { get; set; } = string.Empty;
        public string EnvironmentName { get; set; } = "Development";
        public string ContentRootPath { get; set; } = string.Empty;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
