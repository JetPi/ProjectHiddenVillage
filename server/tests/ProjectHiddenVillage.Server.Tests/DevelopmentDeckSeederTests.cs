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
    [TestMethod]
    public async Task SeedAsync_CreatesSupportCapablePlaceholder_ForN008_WhenCatalogIsMissing()
    {
        await using var dbContext = CreateDbContext();

        // Seed only the minimum users required by DevelopmentDeckSeeder's deck write path.
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

        var environment = new TestWebHostEnvironment
        {
            ContentRootPath = ResolveServerProjectRootPath(),
        };
        var seeder = new DevelopmentDeckSeeder(dbContext, NullLogger<DevelopmentDeckSeeder>.Instance, environment);

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

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"development-deck-seeder-tests-{Guid.NewGuid()}")
            .Options;

        return new ApplicationDbContext(options);
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
