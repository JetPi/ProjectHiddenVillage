using Microsoft.EntityFrameworkCore;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Data;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// The record half of a deck listing: it belongs to the player, not to the deck, so it only travels to that player;
/// and it is cleared when the cards change, because a record has to describe the list that earned it.
/// </summary>
[TestClass]
public sealed class DeckRecordTests
{
    [TestMethod]
    public async Task GetDecks_IncludesTheViewersOwnRecord()
    {
        await using var dbContext = CreateDbContext();
        var owner = SeedUser(dbContext, "owner");
        var deck = SeedDeck(dbContext, owner, DeckType.User, "Owner deck");
        dbContext.DeckRecords.Add(new DeckRecord
        {
            DeckId = deck.Id,
            UserId = owner.Id,
            Wins = 7,
            Losses = 3,
            Draws = 1,
        });
        await dbContext.SaveChangesAsync();

        var result = await new DeckService(dbContext).GetDecks(
            userId: owner.Id,
            viewerUserId: owner.Id);

        Assert.IsFalse(result.IsError);
        var listed = result.Value.Single(response => response.Id == deck.Id);
        Assert.IsNotNull(listed.Record);
        Assert.AreEqual(7, listed.Record.Wins);
        Assert.AreEqual(3, listed.Record.Losses);
        Assert.AreEqual(1, listed.Record.Draws);
    }

    [TestMethod]
    public async Task GetDecks_OmitsTheRecordForAnyOtherViewer()
    {
        await using var dbContext = CreateDbContext();
        var owner = SeedUser(dbContext, "owner");
        var stranger = SeedUser(dbContext, "stranger");
        var deck = SeedDeck(dbContext, owner, DeckType.User, "Owner deck");
        dbContext.DeckRecords.Add(new DeckRecord
        {
            DeckId = deck.Id,
            UserId = owner.Id,
            Wins = 7,
            Losses = 3,
        });
        await dbContext.SaveChangesAsync();

        var service = new DeckService(dbContext);
        var asStranger = await service.GetDecks(userId: owner.Id, viewerUserId: stranger.Id);
        var anonymous = await service.GetDecks(userId: owner.Id);

        Assert.IsFalse(asStranger.IsError);
        Assert.IsFalse(anonymous.IsError);
        Assert.IsNull(asStranger.Value.Single().Record);
        Assert.IsNull(anonymous.Value.Single().Record);
    }

    [TestMethod]
    public async Task GetDecks_ReportsNoRecordForADeckThatWasNeverPlayed()
    {
        await using var dbContext = CreateDbContext();
        var owner = SeedUser(dbContext, "owner");
        SeedDeck(dbContext, owner, DeckType.User, "Unplayed deck");
        await dbContext.SaveChangesAsync();

        var result = await new DeckService(dbContext).GetDecks(
            userId: owner.Id,
            viewerUserId: owner.Id);

        Assert.IsFalse(result.IsError);
        Assert.IsNull(result.Value.Single().Record);
    }

    [TestMethod]
    public async Task GetDecks_KeepsAPublicDeckRecordPerPlayer()
    {
        await using var dbContext = CreateDbContext();
        var first = SeedUser(dbContext, "first");
        var second = SeedUser(dbContext, "second");
        var publicDeck = SeedDeck(dbContext, user: null, DeckType.Public, "Shared deck");
        dbContext.DeckRecords.AddRange(
            new DeckRecord { DeckId = publicDeck.Id, UserId = first.Id, Wins = 4, Losses = 4 },
            new DeckRecord { DeckId = publicDeck.Id, UserId = second.Id, Wins = 1, Losses = 9 });
        await dbContext.SaveChangesAsync();

        var service = new DeckService(dbContext);
        var firstView = await service.GetDecks(type: DeckType.Public, viewerUserId: first.Id);
        var secondView = await service.GetDecks(type: DeckType.Public, viewerUserId: second.Id);

        Assert.IsFalse(firstView.IsError);
        Assert.IsFalse(secondView.IsError);
        Assert.AreEqual(4, firstView.Value.Single().Record!.Wins);
        Assert.AreEqual(1, secondView.Value.Single().Record!.Wins);
    }

    [TestMethod]
    public async Task UpdateDeck_KeepsTheRecordWhenOnlyTheNameChanges()
    {
        await using var dbContext = CreateDbContext();
        var owner = SeedUser(dbContext, "owner");
        var card = SeedCatalogEntry(dbContext, "C-700");
        var deck = SeedDeck(dbContext, owner, DeckType.User, "Before", card, quantity: 2);
        AddPermissiveRuleset(dbContext, nonLeaderCardCount: 2);
        dbContext.DeckRecords.Add(new DeckRecord
        {
            DeckId = deck.Id,
            UserId = owner.Id,
            Wins = 5,
            Losses = 2,
        });
        await dbContext.SaveChangesAsync();

        var result = await new DeckService(dbContext).UpdateDeckAsync(
            deck.Id.ToString(),
            new UpdateDeckRequest(Name: "After", Cards: [new DeckCardRequest("C-700", 2)]),
            requestingUserId: owner.Id);

        Assert.IsFalse(result.IsError, result.IsError ? result.FirstError.Description : string.Empty);
        Assert.IsTrue(
            await dbContext.DeckRecords.AnyAsync(record => record.DeckId == deck.Id),
            "renaming a deck does not change the deck it plays");
    }

    [TestMethod]
    public async Task UpdateDeck_KeepsTheRecordWhenTheSameCardsAreSavedAgain()
    {
        await using var dbContext = CreateDbContext();
        var owner = SeedUser(dbContext, "owner");
        var card = SeedCatalogEntry(dbContext, "C-701");
        var deck = SeedDeck(dbContext, owner, DeckType.User, "Same", card, quantity: 3);
        AddPermissiveRuleset(dbContext, nonLeaderCardCount: 3);
        dbContext.DeckRecords.Add(new DeckRecord
        {
            DeckId = deck.Id,
            UserId = owner.Id,
            Wins = 1,
            Losses = 1,
        });
        await dbContext.SaveChangesAsync();

        var result = await new DeckService(dbContext).UpdateDeckAsync(
            deck.Id.ToString(),
            new UpdateDeckRequest(Name: "Same", Cards: [new DeckCardRequest("C-701", 3)]),
            requestingUserId: owner.Id);

        Assert.IsFalse(result.IsError, result.IsError ? result.FirstError.Description : string.Empty);
        Assert.IsTrue(await dbContext.DeckRecords.AnyAsync(record => record.DeckId == deck.Id));
    }

    [TestMethod]
    public async Task UpdateDeck_KeepsTheRecordWhenOnlyTheCardRatiosChange()
    {
        await using var dbContext = CreateDbContext();
        var owner = SeedUser(dbContext, "owner");
        var card = SeedCatalogEntry(dbContext, "C-703");
        var deck = SeedDeck(dbContext, owner, DeckType.User, "Tuned", card, quantity: 2);
        AddPermissiveRuleset(dbContext, nonLeaderCardCount: 3);
        dbContext.DeckRecords.Add(new DeckRecord
        {
            DeckId = deck.Id,
            UserId = owner.Id,
            Wins = 6,
            Losses = 4,
        });
        await dbContext.SaveChangesAsync();

        var result = await new DeckService(dbContext).UpdateDeckAsync(
            deck.Id.ToString(),
            new UpdateDeckRequest(Name: "Tuned", Cards: [new DeckCardRequest("C-703", 3)]),
            requestingUserId: owner.Id);

        Assert.IsFalse(result.IsError, result.IsError ? result.FirstError.Description : string.Empty);
        Assert.IsTrue(
            await dbContext.DeckRecords.AnyAsync(record => record.DeckId == deck.Id),
            "tuning a list that has already been played does not start it over");
    }

    [TestMethod]
    public async Task UpdateDeck_ClearsEveryRecordForTheDeckWhenTheLeaderChanges()
    {
        await using var dbContext = CreateDbContext();
        var first = SeedUser(dbContext, "first");
        var second = SeedUser(dbContext, "second");
        var oldLeader = SeedCatalogEntry(dbContext, "L-710", CardType.Leader);
        var newLeader = SeedCatalogEntry(dbContext, "L-711", CardType.Leader);
        var character = SeedCatalogEntry(dbContext, "C-710");
        var deck = SeedDeckWithCards(
            dbContext,
            user: null,
            DeckType.Public,
            "Shared",
            (oldLeader, 1),
            (character, 1));
        AddPermissiveRuleset(dbContext, nonLeaderCardCount: 1, leaderCount: 1);
        dbContext.DeckRecords.AddRange(
            new DeckRecord { DeckId = deck.Id, UserId = first.Id, Wins = 5, Losses = 2 },
            new DeckRecord { DeckId = deck.Id, UserId = second.Id, Wins = 0, Losses = 3 });
        await dbContext.SaveChangesAsync();

        var result = await new DeckService(dbContext).UpdateDeckAsync(
            deck.Id.ToString(),
            new UpdateDeckRequest(
                Name: "Shared",
                Cards: [new DeckCardRequest("L-711", 1), new DeckCardRequest("C-710", 1)]),
            isAdmin: true);

        Assert.IsFalse(result.IsError, result.IsError ? result.FirstError.Description : string.Empty);
        Assert.AreEqual(
            0,
            await dbContext.DeckRecords.CountAsync(record => record.DeckId == deck.Id),
            "the leader defines the deck, so swapping it starts the record over for everyone who played it");
    }

    [TestMethod]
    public async Task UpdateDeck_WhenTheDeckBelongsToAnotherPlayer_ReturnsForbidden()
    {
        await using var dbContext = CreateDbContext();
        var owner = SeedUser(dbContext, "owner");
        var outsider = SeedUser(dbContext, "outsider");
        var card = SeedCatalogEntry(dbContext, "C-711");
        var deck = SeedDeck(dbContext, owner, DeckType.User, "Mine", card, quantity: 1);
        AddPermissiveRuleset(dbContext, nonLeaderCardCount: 1);
        await dbContext.SaveChangesAsync();

        var result = await new DeckService(dbContext).UpdateDeckAsync(
            deck.Id.ToString(),
            new UpdateDeckRequest(Name: "Stolen", Cards: [new DeckCardRequest("C-711", 1)]),
            requestingUserId: outsider.Id);

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Deck.Update.Forbidden", result.FirstError.Code);
        Assert.AreEqual(
            "Mine",
            (await dbContext.Decks.SingleAsync(record => record.Id == deck.Id)).Name,
            "a refused edit changes nothing");
    }

    [TestMethod]
    public async Task UpdateDeck_WhenAnAdminOverwritesAPublicDeck_IsAllowed()
    {
        await using var dbContext = CreateDbContext();
        var card = SeedCatalogEntry(dbContext, "C-713");
        var deck = SeedDeck(dbContext, user: null, DeckType.Public, "Catalogue deck", card, quantity: 1);
        AddPermissiveRuleset(dbContext, nonLeaderCardCount: 1);
        await dbContext.SaveChangesAsync();

        var result = await new DeckService(dbContext).UpdateDeckAsync(
            deck.Id.ToString(),
            new UpdateDeckRequest(Name: "Curated", Cards: [new DeckCardRequest("C-713", 1)]),
            requestingUserId: Guid.NewGuid(),
            isAdmin: true);

        Assert.IsFalse(result.IsError, result.IsError ? result.FirstError.Description : string.Empty);
        Assert.AreEqual("Curated", result.Value.Name);
    }

    /// <summary>
    /// The update path re-validates the deck against the active formats, so the tests that exercise it need one that
    /// accepts the list they send: no leader, no colour match, and exactly the non-leader count they expect.
    /// </summary>
    private static void AddPermissiveRuleset(
        ApplicationDbContext dbContext,
        int nonLeaderCardCount,
        int leaderCount = 0)
    {
        dbContext.DeckRulesets.Add(new DeckRuleset
        {
            Key = $"test-{Guid.NewGuid():N}",
            Name = "Test Ruleset",
            IsActive = true,
            LeaderCount = leaderCount,
            NonLeaderCardCount = nonLeaderCardCount,
            MaxCopiesPerNonLeaderCard = 4,
            RequireLeaderColorMatch = false,
            AllowChakraCards = false,
            AllowSummonCards = false,
            SortOrder = 0,
            CreatedAtUtc = DateTimeOffset.UtcNow,
            UpdatedAtUtc = DateTimeOffset.UtcNow,
        });
    }

    private static User SeedUser(ApplicationDbContext dbContext, string name)
    {
        var user = new User
        {
            Email = $"{name}-{Guid.NewGuid():N}@hiddenvillage.local",
            Username = name,
            PasswordHash = "not-a-real-hash",
        };

        dbContext.Users.Add(user);
        return user;
    }

    private static Deck SeedDeck(
        ApplicationDbContext dbContext,
        User? user,
        DeckType type,
        string name,
        CardCatalogEntry? card = null,
        int quantity = 0)
    {
        var deck = new Deck
        {
            Type = type,
            Name = name,
            UserId = user?.Id,
            User = user,
        };

        if (card is not null)
        {
            deck.Cards.Add(new DeckCard
            {
                CardCatalogEntry = card,
                Quantity = quantity,
            });
        }

        dbContext.Decks.Add(deck);
        return deck;
    }

    private static Deck SeedDeckWithCards(
        ApplicationDbContext dbContext,
        User? user,
        DeckType type,
        string name,
        params (CardCatalogEntry Card, int Quantity)[] cards)
    {
        var deck = new Deck
        {
            Type = type,
            Name = name,
            UserId = user?.Id,
            User = user,
        };

        foreach (var (card, quantity) in cards)
        {
            deck.Cards.Add(new DeckCard
            {
                CardCatalogEntry = card,
                Quantity = quantity,
            });
        }

        dbContext.Decks.Add(deck);
        return deck;
    }

    private static CardCatalogEntry SeedCatalogEntry(
        ApplicationDbContext dbContext,
        string cardId,
        CardType type = CardType.Character)
    {
        var entry = new CardCatalogEntry
        {
            CardId = cardId,
            DisplayName = cardId,
            Type = type,
            Color = CardColor.Red,
            Description = "desc",
            NameJson = "[]",
            TraitsJson = "[]",
            ConditionsJson = "[]",
            EffectsJson = "[]",
            CreatedAtUtc = DateTimeOffset.UtcNow,
            UpdatedAtUtc = DateTimeOffset.UtcNow,
        };

        dbContext.CardCatalogEntries.Add(entry);
        return entry;
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: $"deck-record-tests-{Guid.NewGuid()}")
            .Options;

        return new ApplicationDbContext(options);
    }
}
