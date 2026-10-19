using Microsoft.EntityFrameworkCore;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Data;
using ProjectHiddenVillage.Server.Data.Entities;
using System.Text.Json;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class CardCatalogQueryTests
{
    [TestMethod]
    public async Task GetCardCatalog_ReturnsPaginatedCards_WithReadableEnumValues()
    {
        await using var dbContext = CreateDbContext();
        dbContext.CardCatalogEntries.AddRange(
            new CardCatalogEntry
            {
                CardId = "A-001",
                Image = "https://example.com/a-001.webp",
                MainAlternate = false,
                DisplayName = "Alpha Card",
                Type = CardType.ExCharacter,
                Color = CardColor.Blue,
                Description = "Alpha description",
                Damage = 1,
                Power = 2,
                NameJson = "[\"Alpha Card\"]",
                TraitsJson = "[\"Ninja\"]",
                ConditionsJson = "[]",
                EffectsJson = JsonSerializer.Serialize(new List<EffectSpec>
                {
                    new()
                    {
                        Id = "effect-1",
                        EffectType = EffectKind.Support,
                        Timing = EffectTiming.ActivateMain,
                        TargetRange = EffectTargetRange.Opponent,
                        IsOptional = false,
                        ChakraCost = 1,
                        GlobalRestrictions = EffectRestrictions.None,
                        ContextRules = []
                    }
                }),
                CreatedAtUtc = DateTimeOffset.UtcNow,
                UpdatedAtUtc = DateTimeOffset.UtcNow
            },
            new CardCatalogEntry
            {
                CardId = "B-001",
                Image = "https://example.com/b-001.webp",
                MainAlternate = true,
                DisplayName = "Beta Card",
                Type = CardType.Leader,
                Color = CardColor.Red,
                Description = "Beta description",
                Damage = 3,
                Power = 4,
                NameJson = "[\"Beta Card\"]",
                TraitsJson = "[\"Hero\"]",
                ConditionsJson = "[]",
                EffectsJson = "[]",
                CreatedAtUtc = DateTimeOffset.UtcNow,
                UpdatedAtUtc = DateTimeOffset.UtcNow
            });
        await dbContext.SaveChangesAsync();

        var service = new CardMappingService(dbContext);
        var result = await service.GetCardCatalog(page: 1, pageSize: 1);

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(1, result.Value.Page);
        Assert.AreEqual(1, result.Value.PageSize);
        Assert.AreEqual(2, result.Value.TotalCount);
        Assert.AreEqual(2, result.Value.TotalPages);
        Assert.AreEqual(1, result.Value.Items.Count);

        // The listing is a projection: the six fields a tile renders, and nothing that has to be deserialised. The
        // seeded entry carries an effect on purpose - it must not reach the response.
        var item = result.Value.Items[0];
        Assert.AreEqual("A-001", item.Id);
        Assert.AreEqual("Alpha Card", item.DisplayName);
        Assert.AreEqual("EX Character", item.Type);
        Assert.AreEqual("Blue", item.Color);
        Assert.AreEqual("https://example.com/a-001.webp", item.Image);
        Assert.IsTrue(item.ImageVersion > 0, "the listing carries the version the tile's art URL is built from");
    }

    [TestMethod]
    public async Task GetTraits_ReturnsDistinctTrimmedTraits()
    {
        await using var dbContext = CreateDbContext();
        dbContext.CardCatalogEntries.AddRange(
            new CardCatalogEntry
            {
                CardId = "A-001",
                Image = "https://example.com/a-001.webp",
                DisplayName = "Alpha Card",
                Type = CardType.Character,
                Color = CardColor.Blue,
                Description = "",
                NameJson = "[]",
                TraitsJson = "[\"Ninja\", \"Uchiha Clan\"]",
                ConditionsJson = "[]",
                EffectsJson = "[]",
                CreatedAtUtc = DateTimeOffset.UtcNow,
                UpdatedAtUtc = DateTimeOffset.UtcNow
            },
            new CardCatalogEntry
            {
                CardId = "B-001",
                Image = "https://example.com/b-001.webp",
                DisplayName = "Beta Card",
                Type = CardType.Character,
                Color = CardColor.Blue,
                Description = "",
                NameJson = "[]",
                TraitsJson = "[\"ninja\", \" Leaf \"]",
                ConditionsJson = "[]",
                EffectsJson = "[]",
                CreatedAtUtc = DateTimeOffset.UtcNow,
                UpdatedAtUtc = DateTimeOffset.UtcNow
            });
        await dbContext.SaveChangesAsync();

        var service = new CardMappingService(dbContext);
        var result = await service.GetTraits();

        Assert.IsFalse(result.IsError);
        CollectionAssert.AreEqual(new[] { "Leaf", "Ninja", "Uchiha Clan" }, result.Value.ToArray());
    }

    [TestMethod]
    public async Task GetCardCatalog_SearchesIdAndDisplayName_InSql()
    {
        await using var dbContext = CreateDbContext();
        await SeedListingCardsAsync(dbContext);

        var service = new CardMappingService(dbContext);

        var byName = await service.GetCardCatalog(page: 1, pageSize: 10, search: "  ALPHA  ");
        var byId = await service.GetCardCatalog(page: 1, pageSize: 10, search: "b-00");
        var noMatch = await service.GetCardCatalog(page: 1, pageSize: 10, search: "no-such-card");

        Assert.IsFalse(byName.IsError);
        Assert.AreEqual(1, byName.Value.Items.Count);
        Assert.AreEqual("A-001", byName.Value.Items[0].Id);
        Assert.AreEqual(1, byName.Value.TotalCount, "the total has to describe the filtered set, not the table");

        Assert.IsFalse(byId.IsError);
        Assert.AreEqual(1, byId.Value.Items.Count);
        Assert.AreEqual("B-001", byId.Value.Items[0].Id);

        Assert.IsFalse(noMatch.IsError);
        Assert.AreEqual(0, noMatch.Value.Items.Count);
        Assert.AreEqual(0, noMatch.Value.TotalCount);
    }

    [TestMethod]
    public async Task GetCardCatalog_FiltersByReadableTypeAndColorValues()
    {
        await using var dbContext = CreateDbContext();
        await SeedListingCardsAsync(dbContext);

        var service = new CardMappingService(dbContext);

        var exCharacters = await service.GetCardCatalog(page: 1, pageSize: 10, types: ["ex character"]);
        var blueOnly = await service.GetCardCatalog(page: 1, pageSize: 10, colors: ["Blue"]);
        var mismatched = await service.GetCardCatalog(page: 1, pageSize: 10, types: ["Leader"], colors: ["Blue"]);

        Assert.IsFalse(exCharacters.IsError);
        Assert.AreEqual(1, exCharacters.Value.Items.Count);
        Assert.AreEqual("A-001", exCharacters.Value.Items[0].Id);

        Assert.IsFalse(blueOnly.IsError);
        Assert.AreEqual(1, blueOnly.Value.Items.Count);
        Assert.AreEqual("A-001", blueOnly.Value.Items[0].Id);

        Assert.IsFalse(mismatched.IsError);
        Assert.AreEqual(0, mismatched.Value.Items.Count);
    }

    [TestMethod]
    public async Task GetCardCatalog_ReturnsValidationError_ForUnsupportedFilterValues()
    {
        await using var dbContext = CreateDbContext();
        var service = new CardMappingService(dbContext);

        var badType = await service.GetCardCatalog(page: 1, pageSize: 10, types: ["rarity"]);
        var badColor = await service.GetCardCatalog(page: 1, pageSize: 10, colors: ["Plaid"]);

        Assert.IsTrue(badType.IsError);
        Assert.AreEqual("Card.Catalog.InvalidType", badType.FirstError.Code);

        Assert.IsTrue(badColor.IsError);
        Assert.AreEqual("Card.Catalog.InvalidColor", badColor.FirstError.Code);
    }

    [TestMethod]
    public async Task GetCardCatalog_NormalizesInvalidPagingInputs()
    {
        await using var dbContext = CreateDbContext();
        dbContext.CardCatalogEntries.Add(new CardCatalogEntry
        {
            CardId = "N-001",
            Image = "https://example.com/n-001.webp",
            DisplayName = "Naruto",
            Type = CardType.Leader,
            Color = CardColor.Red,
            Description = "desc",
            NameJson = "[\"Naruto\"]",
            TraitsJson = "[]",
            ConditionsJson = "[]",
            EffectsJson = "[]",
            CreatedAtUtc = DateTimeOffset.UtcNow,
            UpdatedAtUtc = DateTimeOffset.UtcNow
        });
        await dbContext.SaveChangesAsync();

        var service = new CardMappingService(dbContext);
        var result = await service.GetCardCatalog(page: 0, pageSize: 1000);

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(1, result.Value.Page);
        Assert.AreEqual(100, result.Value.PageSize);
        Assert.AreEqual(1, result.Value.TotalCount);
        Assert.AreEqual(1, result.Value.TotalPages);
        Assert.AreEqual(1, result.Value.Items.Count);
    }

    [TestMethod]
    public async Task GetCardCatalog_AppliesDescendingSort_WhenPrefixedWithDash()
    {
        await using var dbContext = CreateDbContext();
        dbContext.CardCatalogEntries.AddRange(
            new CardCatalogEntry
            {
                CardId = "A-001",
                Image = "https://example.com/a-001.webp",
                DisplayName = "Alpha",
                Type = CardType.Character,
                Color = CardColor.Red,
                Description = "desc",
                Power = 10,
                NameJson = "[\"Alpha\"]",
                TraitsJson = "[]",
                ConditionsJson = "[]",
                EffectsJson = "[]",
                CreatedAtUtc = DateTimeOffset.UtcNow,
                UpdatedAtUtc = DateTimeOffset.UtcNow
            },
            new CardCatalogEntry
            {
                CardId = "B-001",
                Image = "https://example.com/b-001.webp",
                DisplayName = "Beta",
                Type = CardType.Character,
                Color = CardColor.Blue,
                Description = "desc",
                Power = 30,
                NameJson = "[\"Beta\"]",
                TraitsJson = "[]",
                ConditionsJson = "[]",
                EffectsJson = "[]",
                CreatedAtUtc = DateTimeOffset.UtcNow,
                UpdatedAtUtc = DateTimeOffset.UtcNow
            });
        await dbContext.SaveChangesAsync();

        var service = new CardMappingService(dbContext);
        var result = await service.GetCardCatalog(page: 1, pageSize: 10, sort: "-power");

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(2, result.Value.Items.Count);
        Assert.AreEqual("B-001", result.Value.Items[0].Id);
        Assert.AreEqual("A-001", result.Value.Items[1].Id);
    }

    [TestMethod]
    public async Task GetCardCatalog_ReturnsValidationError_ForUnsupportedSortField()
    {
        await using var dbContext = CreateDbContext();
        var service = new CardMappingService(dbContext);

        var result = await service.GetCardCatalog(page: 1, pageSize: 10, sort: "rarity");

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Card.Catalog.InvalidSort", result.FirstError.Code);
    }

    [TestMethod]
    public async Task GetCardCatalogByIds_ReturnsFoundCards_InRequestedOrder()
    {
        await using var dbContext = CreateDbContext();
        dbContext.CardCatalogEntries.AddRange(
            new CardCatalogEntry
            {
                CardId = "A-001",
                Image = "https://example.com/a-001.webp",
                DisplayName = "Alpha",
                Type = CardType.Character,
                Color = CardColor.Red,
                Description = "desc",
                NameJson = "[\"Alpha\"]",
                TraitsJson = "[]",
                ConditionsJson = "[]",
                EffectsJson = "[]",
                CreatedAtUtc = DateTimeOffset.UtcNow,
                UpdatedAtUtc = DateTimeOffset.UtcNow
            },
            new CardCatalogEntry
            {
                CardId = "B-001",
                Image = "https://example.com/b-001.webp",
                DisplayName = "Beta",
                Type = CardType.ExCharacter,
                Color = CardColor.Blue,
                Description = "desc",
                NameJson = "[\"Beta\"]",
                TraitsJson = "[]",
                ConditionsJson = "[]",
                EffectsJson = "[]",
                CreatedAtUtc = DateTimeOffset.UtcNow,
                UpdatedAtUtc = DateTimeOffset.UtcNow
            });
        await dbContext.SaveChangesAsync();

        var service = new CardMappingService(dbContext);
        var result = await service.GetCardCatalogByIds(["B-001", "missing-id", "A-001"]);

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(2, result.Value.Count);
        Assert.AreEqual("B-001", result.Value[0].Id);
        Assert.AreEqual("A-001", result.Value[1].Id);
        Assert.AreEqual("EX Character", result.Value[0].Type);
        Assert.AreEqual("Blue", result.Value[0].Color);
    }

    [TestMethod]
    public async Task GetCardCatalogByIds_NormalizesWhitespaceAndDeduplicatesCaseInsensitively()
    {
        await using var dbContext = CreateDbContext();
        dbContext.CardCatalogEntries.AddRange(
            new CardCatalogEntry
            {
                CardId = "N-001",
                Image = "https://example.com/n-001.webp",
                DisplayName = "Naruto",
                Type = CardType.Leader,
                Color = CardColor.Red,
                Description = "desc",
                NameJson = "[\"Naruto\"]",
                TraitsJson = "[]",
                ConditionsJson = "[]",
                EffectsJson = "[]",
                CreatedAtUtc = DateTimeOffset.UtcNow,
                UpdatedAtUtc = DateTimeOffset.UtcNow
            },
            new CardCatalogEntry
            {
                CardId = "S-001",
                Image = "https://example.com/s-001.webp",
                DisplayName = "Sasuke",
                Type = CardType.Character,
                Color = CardColor.Blue,
                Description = "desc",
                NameJson = "[\"Sasuke\"]",
                TraitsJson = "[]",
                ConditionsJson = "[]",
                EffectsJson = "[]",
                CreatedAtUtc = DateTimeOffset.UtcNow,
                UpdatedAtUtc = DateTimeOffset.UtcNow
            });
        await dbContext.SaveChangesAsync();

        var service = new CardMappingService(dbContext);
        var result = await service.GetCardCatalogByIds(["  n-001  ", "", "N-001", "   ", "s-001"]);

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(2, result.Value.Count);
        Assert.AreEqual("N-001", result.Value[0].Id);
        Assert.AreEqual("S-001", result.Value[1].Id);
    }

    [TestMethod]
    public async Task GetCardCatalogByIds_ReturnsValidationError_WhenPayloadIsEmptyOrInvalid()
    {
        await using var dbContext = CreateDbContext();
        var service = new CardMappingService(dbContext);

        var nullPayloadResult = await service.GetCardCatalogByIds(null);
        var emptyPayloadResult = await service.GetCardCatalogByIds([]);
        var blankOnlyPayloadResult = await service.GetCardCatalogByIds(["", "   "]);

        Assert.IsTrue(nullPayloadResult.IsError);
        Assert.AreEqual("Card.CatalogByIds.Empty", nullPayloadResult.FirstError.Code);

        Assert.IsTrue(emptyPayloadResult.IsError);
        Assert.AreEqual("Card.CatalogByIds.Empty", emptyPayloadResult.FirstError.Code);

        Assert.IsTrue(blankOnlyPayloadResult.IsError);
        Assert.AreEqual("Card.CatalogByIds.Empty", blankOnlyPayloadResult.FirstError.Code);
    }

    /// <summary>Two cards that differ in every field the listing filters on.</summary>
    private static async Task SeedListingCardsAsync(ApplicationDbContext dbContext)
    {
        dbContext.CardCatalogEntries.AddRange(
            new CardCatalogEntry
            {
                CardId = "A-001",
                Image = "https://example.com/a-001.webp",
                DisplayName = "Alpha Card",
                Type = CardType.ExCharacter,
                Color = CardColor.Blue,
                Description = "desc",
                NameJson = "[\"Alpha Card\"]",
                TraitsJson = "[]",
                ConditionsJson = "[]",
                EffectsJson = "[]",
                CreatedAtUtc = DateTimeOffset.UtcNow,
                UpdatedAtUtc = DateTimeOffset.UtcNow
            },
            new CardCatalogEntry
            {
                CardId = "B-001",
                Image = "https://example.com/b-001.webp",
                DisplayName = "Beta Card",
                Type = CardType.Leader,
                Color = CardColor.Red,
                Description = "desc",
                NameJson = "[\"Beta Card\"]",
                TraitsJson = "[]",
                ConditionsJson = "[]",
                EffectsJson = "[]",
                CreatedAtUtc = DateTimeOffset.UtcNow,
                UpdatedAtUtc = DateTimeOffset.UtcNow
            });

        await dbContext.SaveChangesAsync();
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: $"card-catalog-query-tests-{Guid.NewGuid()}")
            .Options;

        return new ApplicationDbContext(options);
    }
}
