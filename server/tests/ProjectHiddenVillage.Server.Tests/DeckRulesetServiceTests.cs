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
                new DeckRulesetCardRestrictionRequest(CardRestrictionMatchType.Card, "c-001", 0),
                new DeckRulesetCardRestrictionRequest(CardRestrictionMatchType.Card, "C-002", 2),
            ]));

        Assert.IsFalse(result.IsError, result.IsError ? result.FirstError.Description : string.Empty);
        Assert.AreEqual("standard", result.Value.Key);
        Assert.AreEqual(2, result.Value.CardRestrictions.Count);
        Assert.AreEqual("C-001", result.Value.CardRestrictions[0].Code);
        Assert.AreEqual(0, result.Value.CardRestrictions[0].MaxCopies);
        Assert.AreEqual("C-002", result.Value.CardRestrictions[1].Code);
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
            restrictions:
            [
                new DeckRulesetCardRestrictionRequest(CardRestrictionMatchType.Card, "C-999", 0),
            ]));

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Deck.Rulesets.UnknownCards", result.FirstError.Code);
        Assert.AreEqual(0, await dbContext.DeckRulesets.CountAsync());
    }

    [TestMethod]
    public async Task UpdateRuleset_ReplacesTheRestrictionList()
    {
        await using var dbContext = CreateDbContext();
        dbContext.CardCatalogEntries.AddRange(
            CreateCatalogEntry("C-001"),
            CreateCatalogEntry("C-002"),
            CreateCatalogEntry("C-003"));
        dbContext.DeckRulesets.Add(CreateRulesetEntity(
            "standard",
            restrictions:
            [
                new DeckRulesetCardRestriction
                {
                    MatchType = CardRestrictionMatchType.Card,
                    Code = "C-001",
                    MaxCopies = 0,
                },
                new DeckRulesetCardRestriction
                {
                    MatchType = CardRestrictionMatchType.Card,
                    Code = "C-002",
                    MaxCopies = 1,
                },
            ]));
        await dbContext.SaveChangesAsync();

        var ruleset = await dbContext.DeckRulesets.SingleAsync();
        var service = new DeckRulesetService(dbContext);
        var result = await service.UpdateRuleset(ruleset.Id.ToString(), new UpdateDeckRulesetRequest(
            Name: "Standard Updated",
            IsActive: true,
            CardPoolMode: CardPoolMode.Open,
            LeaderCount: 1,
            NonLeaderCardCount: 50,
            MaxCopiesPerNonLeaderCard: 4,
            RequireLeaderColorMatch: true,
            AllowChakraCards: false,
            AllowSummonCards: false,
            SortOrder: 0,
            CardRestrictions:
            [
                new DeckRulesetCardRestrictionRequest(CardRestrictionMatchType.Card, "C-002", 3),
                new DeckRulesetCardRestrictionRequest(CardRestrictionMatchType.Card, "C-003", 0),
            ]));

        Assert.IsFalse(result.IsError, result.IsError ? result.FirstError.Description : string.Empty);
        Assert.AreEqual("Standard Updated", result.Value.Name);
        Assert.AreEqual(2, result.Value.CardRestrictions.Count);

        var persisted = await dbContext.DeckRulesetCardRestrictions
            .AsNoTracking()
            .ToListAsync();

        Assert.AreEqual(2, persisted.Count);
        Assert.IsTrue(persisted.Any(restriction => restriction.Code == "C-002" && restriction.MaxCopies == 3));
        Assert.IsTrue(persisted.Any(restriction => restriction.Code == "C-003" && restriction.MaxCopies == 0));
        Assert.IsFalse(persisted.Any(restriction => restriction.Code == "C-001"));
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
            CardPoolMode: CardPoolMode.Open,
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
    public async Task CreateRuleset_PersistsTheActionClockSettings()
    {
        await using var dbContext = CreateDbContext();
        var service = new DeckRulesetService(dbContext);

        var result = await service.CreateRuleset(new CreateDeckRulesetRequest(
            Key: "untimed",
            Name: "Untimed",
            IsActive: true,
            CardPoolMode: CardPoolMode.Open,
            LeaderCount: 1,
            NonLeaderCardCount: 50,
            MaxCopiesPerNonLeaderCard: 4,
            RequireLeaderColorMatch: true,
            AllowChakraCards: false,
            AllowSummonCards: false,
            SortOrder: 0,
            CardRestrictions: [],
            ClockEnabled: false,
            MainPhaseSeconds: 45,
            OtherPhaseSeconds: 20,
            PlayerPoolSeconds: 900,
            TimeoutsBeforeForfeit: 2));

        Assert.IsFalse(result.IsError, result.IsError ? result.FirstError.Description : string.Empty);
        Assert.IsFalse(result.Value.ClockEnabled);
        Assert.AreEqual(45, result.Value.MainPhaseSeconds);
        Assert.AreEqual(20, result.Value.OtherPhaseSeconds);
        Assert.AreEqual(900, result.Value.PlayerPoolSeconds);
        Assert.AreEqual(2, result.Value.TimeoutsBeforeForfeit);

        // The definition a created game reads carries the same policy, which is what it snapshots.
        var definitionResult = await service.GetActiveRulesetDefinition(result.Value.Id);
        Assert.IsFalse(definitionResult.IsError);
        Assert.IsFalse(definitionResult.Value.Clock.Enabled);
        Assert.AreEqual(TimeSpan.FromSeconds(45), definitionResult.Value.Clock.MainPhaseBudget);
        Assert.AreEqual(TimeSpan.FromSeconds(20), definitionResult.Value.Clock.OtherPhaseBudget);
        Assert.AreEqual(TimeSpan.FromSeconds(900), definitionResult.Value.Clock.PlayerPoolBudget);
        Assert.AreEqual(2, definitionResult.Value.Clock.TimeoutsBeforeForfeit);
    }

    [TestMethod]
    public async Task CreateRuleset_PersistsQuickMatchAvailability()
    {
        await using var dbContext = CreateDbContext();
        var service = new DeckRulesetService(dbContext);

        var hostOnly = await service.CreateRuleset(CreateRequest(key: "invite-only", availableInQuickMatch: false));

        Assert.IsFalse(hostOnly.IsError, hostOnly.IsError ? hostOnly.FirstError.Description : string.Empty);
        Assert.IsFalse(hostOnly.Value.AvailableInQuickMatch);

        // The queue reads the definition, so that projection has to carry the flag too.
        var definitionResult = await service.GetActiveRulesetDefinition(hostOnly.Value.Id);
        Assert.IsFalse(definitionResult.IsError);
        Assert.IsFalse(definitionResult.Value.AvailableInQuickMatch);

        // Flipping it back makes the format quick-matchable again without touching anything else.
        var updated = await service.UpdateRuleset(hostOnly.Value.Id.ToString(), new UpdateDeckRulesetRequest(
            Name: "Invite Only",
            IsActive: true,
            CardPoolMode: CardPoolMode.Open,
            LeaderCount: 1,
            NonLeaderCardCount: 50,
            MaxCopiesPerNonLeaderCard: 4,
            RequireLeaderColorMatch: true,
            AllowChakraCards: false,
            AllowSummonCards: false,
            SortOrder: 0,
            CardRestrictions: [],
            AvailableInQuickMatch: true));

        Assert.IsFalse(updated.IsError, updated.IsError ? updated.FirstError.Description : string.Empty);
        Assert.IsTrue(updated.Value.AvailableInQuickMatch);
        Assert.IsTrue(await dbContext.DeckRulesets
            .Where(ruleset => ruleset.Id == hostOnly.Value.Id)
            .Select(ruleset => ruleset.AvailableInQuickMatch)
            .SingleAsync());
    }

    [TestMethod]
    public async Task CreateRuleset_IsQuickMatchableByDefault()
    {
        await using var dbContext = CreateDbContext();
        var service = new DeckRulesetService(dbContext);

        var result = await service.CreateRuleset(CreateRequest(key: "standard"));

        Assert.IsFalse(result.IsError, result.IsError ? result.FirstError.Description : string.Empty);
        Assert.IsTrue(
            result.Value.AvailableInQuickMatch,
            "A new format joins the queue unless the admin deliberately marks it host-only.");
    }

    [TestMethod]
    public async Task CreateRuleset_RejectsAClockBudgetThatCannotRun()
    {
        await using var dbContext = CreateDbContext();
        var service = new DeckRulesetService(dbContext);

        var result = await service.CreateRuleset(new CreateDeckRulesetRequest(
            Key: "broken",
            Name: "Broken",
            IsActive: true,
            CardPoolMode: CardPoolMode.Open,
            LeaderCount: 1,
            NonLeaderCardCount: 50,
            MaxCopiesPerNonLeaderCard: 4,
            RequireLeaderColorMatch: true,
            AllowChakraCards: false,
            AllowSummonCards: false,
            SortOrder: 0,
            CardRestrictions: [],
            MainPhaseSeconds: 0));

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Deck.Rulesets.InvalidClock", result.FirstError.Code);
        Assert.AreEqual(0, await dbContext.DeckRulesets.CountAsync());
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

    [TestMethod]
    public async Task CreateRuleset_AcceptsASetRuleForASetTheCatalogueDoesNotKnowYet()
    {
        await using var dbContext = CreateDbContext();
        var service = new DeckRulesetService(dbContext);

        var result = await service.CreateRuleset(CreateRequest(
            restrictions:
            [
                new DeckRulesetCardRestrictionRequest(CardRestrictionMatchType.Set, "sample", 0),
            ]));

        Assert.IsFalse(result.IsError, result.IsError ? result.FirstError.Description : string.Empty);
        var rule = result.Value.CardRestrictions.Single();
        Assert.AreEqual(CardRestrictionMatchType.Set, rule.MatchType);
        Assert.AreEqual("SAMPLE", rule.Code);
    }

    [TestMethod]
    public async Task CreateRuleset_RejectsAnAllowListWithoutAnAllowingRule()
    {
        await using var dbContext = CreateDbContext();
        var service = new DeckRulesetService(dbContext);

        var result = await service.CreateRuleset(CreateRequest(
            cardPoolMode: CardPoolMode.AllowList,
            restrictions:
            [
                new DeckRulesetCardRestrictionRequest(CardRestrictionMatchType.Set, "SAMPLE", 0),
            ]));

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Deck.Rulesets.EmptyAllowList", result.FirstError.Code);
        Assert.AreEqual(0, await dbContext.DeckRulesets.CountAsync());
    }

    [TestMethod]
    public async Task GetCardPoolSetCodes_GroupsCatalogueIdsByTheirSetSegment()
    {
        await using var dbContext = CreateDbContext();
        dbContext.CardCatalogEntries.AddRange(
            CreateCatalogEntry("N-001"),
            CreateCatalogEntry("N-002"),
            CreateCatalogEntry("SAMPLE-1"),
            CreateCatalogEntry("S-001"));
        await dbContext.SaveChangesAsync();

        var service = new DeckRulesetService(dbContext);
        var result = await service.GetCardPoolSetCodes();

        Assert.IsFalse(result.IsError, result.IsError ? result.FirstError.Description : string.Empty);
        CollectionAssert.AreEquivalent(
            new[] { "N:2", "SAMPLE:1", "S:1" },
            result.Value.Select(setCode => $"{setCode.Code}:{setCode.CardCount}").ToList());
    }

    private static CreateDeckRulesetRequest CreateRequest(
        string key = "standard",
        IReadOnlyList<DeckRulesetCardRestrictionRequest>? restrictions = null,
        bool availableInQuickMatch = true,
        CardPoolMode cardPoolMode = CardPoolMode.Open)
    {
        return new CreateDeckRulesetRequest(
            Key: key,
            Name: "Standard",
            IsActive: true,
            CardPoolMode: cardPoolMode,
            LeaderCount: 1,
            NonLeaderCardCount: 50,
            MaxCopiesPerNonLeaderCard: 4,
            RequireLeaderColorMatch: true,
            AllowChakraCards: false,
            AllowSummonCards: false,
            SortOrder: 0,
            CardRestrictions: restrictions ?? [],
            AvailableInQuickMatch: availableInQuickMatch);
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
            CardPoolMode = CardPoolMode.Open,
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
