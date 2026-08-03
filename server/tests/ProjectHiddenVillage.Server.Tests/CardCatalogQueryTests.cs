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
                OriginalId = "A-001",
                MainAlternate = false,
                Attribute = "Wind",
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
                        Kind = EffectKind.FlipCardDown,
                        Timing = EffectTiming.ActivateMain,
                        Args = new Dictionary<string, string>
                        {
                            ["target"] = "opponent"
                        }
                    }
                }),
                CreatedAtUtc = DateTimeOffset.UtcNow,
                UpdatedAtUtc = DateTimeOffset.UtcNow
            },
            new CardCatalogEntry
            {
                CardId = "B-001",
                Image = "https://example.com/b-001.webp",
                OriginalId = "B-001",
                MainAlternate = true,
                Attribute = "Fire",
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

        var item = result.Value.Items[0];
        Assert.AreEqual("A-001", item.Id);
        Assert.AreEqual("EX Character", item.Type);
        Assert.AreEqual("Blue", item.Color);
        Assert.AreEqual(1, item.Effects.Count);
        Assert.AreEqual("Flip Card Down", item.Effects[0].Kind);
        Assert.AreEqual("Activate Main", item.Effects[0].Timing);
    }

    [TestMethod]
    public async Task GetCardCatalog_NormalizesInvalidPagingInputs()
    {
        await using var dbContext = CreateDbContext();
        dbContext.CardCatalogEntries.Add(new CardCatalogEntry
        {
            CardId = "N-001",
            Image = "https://example.com/n-001.webp",
            OriginalId = "N-001",
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
                OriginalId = "A-001",
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
                OriginalId = "B-001",
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

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: $"card-catalog-query-tests-{Guid.NewGuid()}")
            .Options;

        return new ApplicationDbContext(options);
    }
}
