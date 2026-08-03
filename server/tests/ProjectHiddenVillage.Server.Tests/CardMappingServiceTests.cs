using Microsoft.EntityFrameworkCore;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Data;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class CardMappingServiceTests
{
    [TestMethod]
    public async Task MapCards_AddsCard_WhenCardIdDoesNotExist()
    {
        await using var dbContext = CreateDbContext();
        var service = new CardMappingService(dbContext);

        var sourceCards = new List<CardDataSourceRecord>
        {
            new()
            {
                CardNo = "N-001",
                Name = "Naruto Uzumaki",
                Image = "https://example.com/n-001.webp",
                Color = "Red",
                CategoryData = "LEADER",
                OriginalId = "N-001",
                MainAlternate = true,
                Attribute = "Wind",
                Damage = 1,
                Power = "3",
                Effect = "[Activate: Main] Text.<br>[Recovery] Recovery text",
                Trait = "Wind/Jinchuriki"
            }
        };

        var result = await service.MapCards(sourceCards);

        Assert.IsFalse(result.IsError);

        var persisted = await dbContext.CardCatalogEntries.SingleAsync(entry => entry.CardId == "N-001");
        Assert.AreEqual("Naruto Uzumaki", persisted.DisplayName);
        Assert.AreEqual("https://example.com/n-001.webp", persisted.Image);
        Assert.AreEqual("N-001", persisted.OriginalId);
        Assert.AreEqual(true, persisted.MainAlternate);
        Assert.AreEqual("Wind", persisted.Attribute);
    }

    [TestMethod]
    public async Task MapCards_UpdatesProvidedFields_AndPreservesMissingFields()
    {
        await using var dbContext = CreateDbContext();
        dbContext.CardCatalogEntries.Add(new CardCatalogEntry
        {
            CardId = "N-001",
            Image = "https://old.example.com/n-001.webp",
            OriginalId = "OLD-001",
            MainAlternate = true,
            Attribute = "Old Attribute",
            DisplayName = "Old Name",
            Type = CardType.Leader,
            Color = CardColor.Red,
            Description = "Old description",
            Damage = 9,
            Power = 9,
            NameJson = "[\"Old Name\"]",
            TraitsJson = "[\"Old Trait\"]",
            ConditionsJson = "[]",
            EffectsJson = "[]",
            Life = 5,
            CreatedAtUtc = DateTimeOffset.UtcNow,
            UpdatedAtUtc = DateTimeOffset.UtcNow
        });
        await dbContext.SaveChangesAsync();

        var service = new CardMappingService(dbContext);
        var sourceCards = new List<CardDataSourceRecord>
        {
            new()
            {
                CardNo = "N-001",
                Name = "Naruto Uzumaki",
                Image = "",
                Color = "Red",
                CategoryData = "LEADER",
                OriginalId = "",
                MainAlternate = null,
                Attribute = null,
                Damage = null,
                Power = null,
                Effect = null,
                Trait = null
            }
        };

        var result = await service.MapCards(sourceCards);

        Assert.IsFalse(result.IsError);

        var persisted = await dbContext.CardCatalogEntries.SingleAsync(entry => entry.CardId == "N-001");
        Assert.AreEqual("Naruto Uzumaki", persisted.DisplayName);
        Assert.AreEqual("https://old.example.com/n-001.webp", persisted.Image);
        Assert.AreEqual("OLD-001", persisted.OriginalId);
        Assert.AreEqual(true, persisted.MainAlternate);
        Assert.AreEqual("Old Attribute", persisted.Attribute);
        Assert.AreEqual(9, persisted.Damage);
        Assert.AreEqual(9, persisted.Power);
        Assert.AreEqual("Old description", persisted.Description);
        Assert.AreEqual("[\"Old Trait\"]", persisted.TraitsJson);
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: $"card-mapping-tests-{Guid.NewGuid()}")
            .Options;

        return new ApplicationDbContext(options);
    }
}