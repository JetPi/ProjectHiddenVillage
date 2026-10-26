using Microsoft.EntityFrameworkCore;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Data;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class DeckRulesetServiceTests
{
    [TestMethod]
    public async Task CreateRuleset_PersistsScalarsAndRestrictions()
    {
        await using var dbContext = CreateDbContext();
        dbContext.CardCatalogEntries.AddRange(
            CreateCatalogEntry("C-001"),
            CreateCatalogEntry("C-002"));
        await dbContext.SaveChangesAsync();

        var service = new DeckRulesetService(dbContext);
        var result = await service.CreateRuleset(CreateRequest(
            key: "standard",
            restrictions:
            [
                new DeckRulesetCardRestrictionRequest("c-001", 0),
                new DeckRulesetCardRestrictionRequest("C-002", 2),
            ]));

        Assert.IsFalse(result.IsError, result.IsError ? result.FirstError.Description : string.Empty);
        Assert.AreEqual("standard", result.Value.Key);
        Assert.AreEqual(2, result.Value.CardRestrictions.Count);
        Assert.AreEqual(0, result.Value.CardRestrictions[0].MaxCopies);
        Assert.AreEqual(2, result.Value.CardRestrictions[1].MaxCopies);

        var persisted = await dbContext.DeckRulesets
            .Include(ruleset => ruleset.CardRestrictions)
            .SingleAsync();

        Assert.AreEqual(2, persisted.CardRestrictions.Count);
    }

    [TestMethod]
    public async Task CreateRuleset_RejectsADuplicateKey()
    {
        await using var dbContext = CreateDbContext();
        dbContext.DeckRulesets.Add(CreateRulesetEntity("standard"));
        await dbContext.SaveChangesAsync();

        var service = new DeckRulesetService(dbContext);
        var result = await service.CreateRuleset(CreateRequest(key: "STANDARD"));

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Deck.Rulesets.KeyExists", result.FirstError.Code);
    }

    [TestMethod]
    public async Task CreateRuleset_RejectsUnknownRestrictionCards()
    {
        await using var dbContext = CreateDbContext();

        var service = new DeckRulesetService(dbContext);
        var result = await service.CreateRuleset(CreateRequest(
            restrictions: [new DeckRulesetCardRestrictionRequest("C-999", 0)]));

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Deck.Rulesets.UnknownCards", result.FirstError.Code);
        Assert.AreEqual(0, await dbContext.DeckRulesets.CountAsync());
    }

    [TestMethod]
    public async Task UpdateRuleset_ReplacesTheRestrictionList()
    {
        await using var dbContext = CreateDbContext();
        var first = CreateCatalogEntry("C-001");
        var second = CreateCatalogEntry("C-002");
        var third = CreateCatalogEntry("C-003");
        dbContext.CardCatalogEntries.AddRange(first, second, third);
        dbContext.DeckRulesets.Add(CreateRulesetEntity(
            "standard",
            restrictions:
            [
                new DeckRulesetCardRestriction { CardCatalogEntry = first, MaxCopies = 0 },
                new DeckRulesetCardRestriction { CardCatalogEntry = second, MaxCopies = 1 },
            ]));
        await dbContext.SaveChangesAsync();

        var ruleset = await dbContext.DeckRulesets.SingleAsync();
        var service = new DeckRulesetService(dbContext);
        var result = await service.UpdateRuleset(ruleset.Id.ToString(), new UpdateDeckRulesetRequest(
            Name: "Standard Updated",
            IsActive: true,
            LeaderCount: 1,
            NonLeaderCardCount: 50,
            MaxCopiesPerNonLeaderCard: 4,
            RequireLeaderColorMatch: true,
            AllowChakraCards: false,
            AllowSummonCards: false,
            SortOrder: 0,
            CardRestrictions:
            [
                new DeckRulesetCardRestrictionRequest("C-002", 3),
                new DeckRulesetCardRestrictionRequest("C-003", 0),
            ]));

        Assert.IsFalse(result.IsError, result.IsError ? result.FirstError.Description : string.Empty);
        Assert.AreEqual("Standard Updated", result.Value.Name);
        Assert.AreEqual(2, result.Value.CardRestrictions.Count);

        var persisted = await dbContext.DeckRulesetCardRestrictions
            .AsNoTracking()
            .ToListAsync();

        Assert.AreEqual(2, persisted.Count);
        Assert.IsTrue(persisted.Any(restriction => restriction.CardCatalogEntryId == second.Id && restriction.MaxCopies == 3));
        Assert.IsTrue(persisted.Any(restriction => restriction.CardCatalogEntryId == third.Id && restriction.MaxCopies == 0));
        Assert.IsFalse(persisted.Any(restriction => restriction.CardCatalogEntryId == first.Id));
    }

    [TestMethod]
    public async Task UpdateRuleset_RefusesToDeactivateTheLastActiveRuleset()
    {
        await using var dbContext = CreateDbContext();
        dbContext.DeckRulesets.Add(CreateRulesetEntity("standard"));
        await dbContext.SaveChangesAsync();

        var ruleset = await dbContext.DeckRulesets.SingleAsync();
        var service = new DeckRulesetService(dbContext);
        var result = await service.UpdateRuleset(ruleset.Id.ToString(), new UpdateDeckRulesetRequest(
            Name: "Standard",
            IsActive: false,
            LeaderCount: 1,
            NonLeaderCardCount: 50,
            MaxCopiesPerNonLeaderCard: 4,
            RequireLeaderColorMatch: true,
            AllowChakraCards: false,
            AllowSummonCards: false,
            SortOrder: 0,
            CardRestrictions: []));

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Deck.Rulesets.LastActive", result.FirstError.Code);
        Assert.IsTrue(await dbContext.DeckRulesets.SingleAsync() is { IsActive: true });
    }

    [TestMethod]
    public async Task DeleteRuleset_RefusesToDeleteTheLastActiveRuleset()
    {
        await using var dbContext = CreateDbContext();
        dbContext.DeckRulesets.Add(CreateRulesetEntity("standard"));
        await dbContext.SaveChangesAsync();

        var ruleset = await dbContext.DeckRulesets.SingleAsync();
        var service = new DeckRulesetService(dbContext);
        var result = await service.DeleteRuleset(ruleset.Id.ToString());

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Deck.Rulesets.LastActive", result.FirstError.Code);
        Assert.AreEqual(1, await dbContext.DeckRulesets.CountAsync());
    }

    [TestMethod]
    public async Task GetRulesets_ReturnsOnlyActiveRulesetsByDefault()
    {
        await using var dbContext = CreateDbContext();
        dbContext.DeckRulesets.AddRange(
            CreateRulesetEntity("standard", isActive: true),
            CreateRulesetEntity("pre-release", isActive: false));
        await dbContext.SaveChangesAsync();

        var service = new DeckRulesetService(dbContext);
        var activeResult = await service.GetRulesets();
        var allResult = await service.GetRulesets(includeInactive: true);

        Assert.IsFalse(activeResult.IsError);
        Assert.AreEqual(1, activeResult.Value.Count);
        Assert.AreEqual("standard", activeResult.Value[0].Key);

        Assert.IsFalse(allResult.IsError);
        Assert.AreEqual(2, allResult.Value.Count);
    }

    private static CreateDeckRulesetRequest CreateRequest(
        string key = "standard",
        IReadOnlyList<DeckRulesetCardRestrictionRequest>? restrictions = null)
    {
        return new CreateDeckRulesetRequest(
            Key: key,
            Name: "Standard",
            IsActive: true,
            LeaderCount: 1,
            NonLeaderCardCount: 50,
            MaxCopiesPerNonLeaderCard: 4,
            RequireLeaderColorMatch: true,
            AllowChakraCards: false,
            AllowSummonCards: false,
            SortOrder: 0,
            CardRestrictions: restrictions ?? []);
    }

    private static DeckRuleset CreateRulesetEntity(
        string key,
        bool isActive = true,
        IReadOnlyList<DeckRulesetCardRestriction>? restrictions = null)
    {
        var now = DateTimeOffset.UtcNow;

        return new DeckRuleset
        {
            Key = key,
            Name = key,
            IsActive = isActive,
            LeaderCount = 1,
            NonLeaderCardCount = 50,
            MaxCopiesPerNonLeaderCard = 4,
            RequireLeaderColorMatch = true,
            AllowChakraCards = false,
            AllowSummonCards = false,
            SortOrder = 0,
            CreatedAtUtc = now,
            UpdatedAtUtc = now,
            CardRestrictions = restrictions?.ToList() ?? [],
        };
    }

    private static CardCatalogEntry CreateCatalogEntry(string cardId)
    {
        return new CardCatalogEntry
        {
            CardId = cardId,
            DisplayName = cardId,
            Type = CardType.Character,
            Color = CardColor.Red,
            Description = "desc",
            NameJson = "[]",
            TraitsJson = "[]",
            ConditionsJson = "[]",
            EffectsJson = "[]",
            CreatedAtUtc = DateTimeOffset.UtcNow,
            UpdatedAtUtc = DateTimeOffset.UtcNow,
        };
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: $"deck-ruleset-tests-{Guid.NewGuid()}")
            .Options;

        return new ApplicationDbContext(options);
    }
}
