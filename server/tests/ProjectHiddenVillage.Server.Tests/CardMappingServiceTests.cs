using Microsoft.EntityFrameworkCore;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Data;
using ProjectHiddenVillage.Server.Data.Entities;
using System.Text.Json;

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

    [TestMethod]
    public async Task UpdateCardEffectsByCardId_UpdatesProvidedFields_Only()
    {
        await using var dbContext = CreateDbContext();
        var originalUpdatedAt = DateTimeOffset.UtcNow.AddMinutes(-10);
        dbContext.CardCatalogEntries.Add(new CardCatalogEntry
        {
            CardId = "N-001",
            Image = "https://example.com/n-001.webp",
            OriginalId = "N-001",
            DisplayName = "Naruto",
            Type = CardType.Leader,
            Color = CardColor.Red,
            Description = "old description",
            ConditionsJson = JsonSerializer.Serialize(new List<string>
            {
                "old-condition"
            }),
            EffectsJson = JsonSerializer.Serialize(new List<EffectSpec>
            {
                new()
                {
                    Id = "old-effect",
                    EffectType = EffectKind.Support,
                    Timing = EffectTiming.ActivateMain,
                    TargetRange = EffectTargetRange.Opponent,
                    IsOptional = false,
                    ChakraCost = 1,
                    GlobalRestrictions = EffectRestrictions.None,
                    ContextRules = []
                }
            }),
            SupportEffect = "old support",
            CreatedAtUtc = DateTimeOffset.UtcNow.AddDays(-1),
            UpdatedAtUtc = originalUpdatedAt
        });
        await dbContext.SaveChangesAsync();

        var service = new CardMappingService(dbContext);
        var request = new UpdateCardEffectsRequest(
            Conditions: null,
            Effects:
            [
                new EffectSpec
                {
                    Id = "new-effect",
                    EffectType = EffectKind.Support,
                    Timing = EffectTiming.ActivateMain,
                    TargetRange = EffectTargetRange.Opponent,
                    IsOptional = false,
                    ChakraCost = 2,
                    GlobalRestrictions = EffectRestrictions.None,
                    ContextRules = []
                }
            ],
            Description: "new description",
            SupportEffect: null);

        var result = await service.UpdateCardEffectsByCardId(" n-001 ", request);

        Assert.IsFalse(result.IsError);
        var persisted = await dbContext.CardCatalogEntries.SingleAsync(entry => entry.CardId == "N-001");
        Assert.AreEqual("new description", persisted.Description);
        Assert.AreEqual("old support", persisted.SupportEffect);
        StringAssert.Contains(persisted.EffectsJson, "new-effect");
        StringAssert.Contains(persisted.ConditionsJson, "old-condition");
        Assert.IsTrue(persisted.UpdatedAtUtc > originalUpdatedAt);
    }

    [TestMethod]
    public async Task UpdateCardEffectsByCardId_ReturnsNotFound_WhenCardIsMissing()
    {
        await using var dbContext = CreateDbContext();
        var service = new CardMappingService(dbContext);

        var result = await service.UpdateCardEffectsByCardId(
            "MISSING-001",
            new UpdateCardEffectsRequest(
                Conditions: null,
                Effects:
                [
                    new EffectSpec
                    {
                        Id = "effect",
                        EffectType = EffectKind.Support,
                        Timing = EffectTiming.ActivateMain,
                        TargetRange = EffectTargetRange.Opponent,
                        IsOptional = false,
                        ChakraCost = 1,
                        GlobalRestrictions = EffectRestrictions.None,
                        ContextRules = []
                    }
                ],
                Description: null,
                SupportEffect: null));

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Card.CatalogEffects.NotFound", result.FirstError.Code);
    }

    [TestMethod]
    public async Task UpdateCardEffectsByCardId_ReturnsValidation_WhenCardIdIsBlank()
    {
        await using var dbContext = CreateDbContext();
        var service = new CardMappingService(dbContext);

        var result = await service.UpdateCardEffectsByCardId(
            "   ",
            new UpdateCardEffectsRequest(
                Conditions: null,
                Effects: null,
                Description: "desc",
                SupportEffect: null));

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Card.CatalogEffects.CardIdRequired", result.FirstError.Code);
    }

    [TestMethod]
    public async Task UpdateCardEffectsByCardId_UpdatesCannotBeNormalSummoned_WhenProvided()
    {
        await using var dbContext = CreateDbContext();
        dbContext.CardCatalogEntries.Add(new CardCatalogEntry
        {
            CardId = "N-777",
            Image = "https://example.com/n-777.webp",
            OriginalId = "N-777",
            DisplayName = "Restricted",
            Type = CardType.Character,
            Color = CardColor.Red,
            Description = "desc",
            NameJson = "[\"Restricted\"]",
            TraitsJson = "[]",
            ConditionsJson = "[]",
            EffectsJson = "[]",
            CannotBeNormalSummoned = false,
            CreatedAtUtc = DateTimeOffset.UtcNow,
            UpdatedAtUtc = DateTimeOffset.UtcNow,
        });
        await dbContext.SaveChangesAsync();

        var service = new CardMappingService(dbContext);
        var result = await service.UpdateCardEffectsByCardId(
            "N-777",
            new UpdateCardEffectsRequest(
                Conditions: null,
                Effects: null,
                Description: null,
                SupportEffect: null,
                CannotBeNormalSummoned: true));

        Assert.IsFalse(result.IsError);
        Assert.IsTrue(result.Value.CannotBeNormalSummoned);

        var persisted = await dbContext.CardCatalogEntries.SingleAsync(entry => entry.CardId == "N-777");
        Assert.IsTrue(persisted.CannotBeNormalSummoned);
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: $"card-mapping-tests-{Guid.NewGuid()}")
            .Options;

        return new ApplicationDbContext(options);
    }
}