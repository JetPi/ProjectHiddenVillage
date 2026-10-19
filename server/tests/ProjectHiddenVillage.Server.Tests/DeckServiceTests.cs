using Microsoft.EntityFrameworkCore;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Data;
using ProjectHiddenVillage.Server.Data.DTOs;
using ProjectHiddenVillage.Server.Data.Entities;
using GameInstanceEntity = ProjectHiddenVillage.Server.Data.Entities.GameInstance;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class DeckServiceTests
{
    [TestMethod]
    public async Task CreateDeck_ParsesPayloadAndPersistsDeckCards()
    {
        await using var dbContext = CreateDbContext();

        dbContext.CardCatalogEntries.AddRange(
            new CardCatalogEntry
            {
                CardId = "N-001",
                DisplayName = "Card 1",
                Type = CardType.Character,
                Color = CardColor.Red,
                Description = "desc",
                NameJson = "[]",
                TraitsJson = "[]",
                ConditionsJson = "[]",
                EffectsJson = "[]",
                CreatedAtUtc = DateTimeOffset.UtcNow,
                UpdatedAtUtc = DateTimeOffset.UtcNow
            },
            new CardCatalogEntry
            {
                CardId = "N-002",
                DisplayName = "Card 2",
                Type = CardType.Character,
                Color = CardColor.Blue,
                Description = "desc",
                NameJson = "[]",
                TraitsJson = "[]",
                ConditionsJson = "[]",
                EffectsJson = "[]",
                CreatedAtUtc = DateTimeOffset.UtcNow,
                UpdatedAtUtc = DateTimeOffset.UtcNow
            });
        await dbContext.SaveChangesAsync();

        var service = new DeckService(dbContext);
        var request = new CreateDeckRequest(
            Type: DeckType.Public,
            Cards: "1x N-001\n2x N-001\n3x N-002");

        var result = await service.CreateDeck(request);

        Assert.IsFalse(result.IsError);

        var deckId = Guid.Parse(result.Value);
        var persistedDeck = await dbContext.Decks
            .Include(deck => deck.Cards)
            .SingleAsync(deck => deck.Id == deckId);

        Assert.AreEqual(DeckType.Public, persistedDeck.Type);
        Assert.AreEqual(2, persistedDeck.Cards.Count);

        var cardIdsByQuantity = await dbContext.DeckCards
            .Where(card => card.DeckId == deckId)
            .Join(
                dbContext.CardCatalogEntries,
                deckCard => deckCard.CardCatalogEntryId,
                catalog => catalog.Id,
                (deckCard, catalog) => new { catalog.CardId, deckCard.Quantity })
            .ToDictionaryAsync(record => record.CardId, record => record.Quantity);

        Assert.AreEqual(3, cardIdsByQuantity["N-001"]);
        Assert.AreEqual(3, cardIdsByQuantity["N-002"]);
    }

    [TestMethod]
    public async Task CreateDeck_ReturnsValidationError_WhenLineFormatIsInvalid()
    {
        await using var dbContext = CreateDbContext();
        var service = new DeckService(dbContext);

        var result = await service.CreateDeck(new CreateDeckRequest(
            Type: DeckType.Public,
            Cards: "bad line"));

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Deck.Create.InvalidCardsFormat", result.FirstError.Code);
    }

    [TestMethod]
    public async Task CreateDeck_ReturnsValidationError_WhenCardDoesNotExist()
    {
        await using var dbContext = CreateDbContext();
        var service = new DeckService(dbContext);

        var result = await service.CreateDeck(new CreateDeckRequest(
            Type: DeckType.Public,
            Cards: "1x N-999"));

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Deck.Create.UnknownCardIds", result.FirstError.Code);
    }

    [TestMethod]
    public async Task CreateDeck_ReturnsValidationError_WhenDeckContainsChakraOrSummonCards()
    {
        await using var dbContext = CreateDbContext();

        dbContext.CardCatalogEntries.AddRange(
            new CardCatalogEntry
            {
                CardId = "N-100",
                DisplayName = "Playable",
                Type = CardType.Character,
                Color = CardColor.Red,
                Description = "desc",
                NameJson = "[]",
                TraitsJson = "[]",
                ConditionsJson = "[]",
                EffectsJson = "[]",
                CreatedAtUtc = DateTimeOffset.UtcNow,
                UpdatedAtUtc = DateTimeOffset.UtcNow
            },
            new CardCatalogEntry
            {
                CardId = "N-101",
                DisplayName = "Chakra",
                Type = CardType.Chakra,
                Color = CardColor.NotApplicable,
                Description = "desc",
                NameJson = "[]",
                TraitsJson = "[]",
                ConditionsJson = "[]",
                EffectsJson = "[]",
                CreatedAtUtc = DateTimeOffset.UtcNow,
                UpdatedAtUtc = DateTimeOffset.UtcNow
            });

        await dbContext.SaveChangesAsync();

        var service = new DeckService(dbContext);
        var result = await service.CreateDeck(new CreateDeckRequest(
            Type: DeckType.Public,
            Cards: "1x N-100\n1x N-101"));

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Deck.Create.UnsupportedCardType", result.FirstError.Code);
    }

    [TestMethod]
    public async Task GetDeck_ReturnsDeckWithResolvedCardIds()
    {
        await using var dbContext = CreateDbContext();
        var userId = Guid.NewGuid();

        dbContext.Users.Add(new User
        {
            Id = userId,
            Username = "tester",
            Email = "tester@example.com",
            PasswordHash = "hash"
        });

        var catalogEntry = new CardCatalogEntry
        {
            CardId = "N-123",
            DisplayName = "Card",
            Type = CardType.Character,
            Color = CardColor.Red,
            Description = "desc",
            NameJson = "[]",
            TraitsJson = "[]",
            ConditionsJson = "[]",
            EffectsJson = "[]",
            CreatedAtUtc = DateTimeOffset.UtcNow,
            UpdatedAtUtc = DateTimeOffset.UtcNow
        };
        dbContext.CardCatalogEntries.Add(catalogEntry);

        var deck = new Deck
        {
            Type = DeckType.User,
            UserId = userId,
            Cards =
            [
                new DeckCard
                {
                    CardCatalogEntry = catalogEntry,
                    Quantity = 2
                }
            ]
        };
        dbContext.Decks.Add(deck);
        await dbContext.SaveChangesAsync();

        var service = new DeckService(dbContext);
        var result = await service.GetDeck(deck.Id.ToString());

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(deck.Id, result.Value.Id);
        Assert.AreEqual("User", result.Value.Type);
        Assert.AreEqual(userId, result.Value.UserId);
        Assert.AreEqual(1, result.Value.Cards.Count);
        Assert.AreEqual("N-123", result.Value.Cards[0].CardId);
        Assert.AreEqual(2, result.Value.Cards[0].Quantity);
    }

    [TestMethod]
    public async Task GetDecks_WhenUserIdProvided_ReturnsOnlyUserDecks()
    {
        await using var dbContext = CreateDbContext();

        var userId = Guid.NewGuid();
        var otherUserId = Guid.NewGuid();

        dbContext.Users.AddRange(
            new User
            {
                Id = userId,
                Username = "tester",
                Email = "tester@example.com",
                PasswordHash = "hash"
            },
            new User
            {
                Id = otherUserId,
                Username = "other",
                Email = "other@example.com",
                PasswordHash = "hash"
            });

        var cardA = new CardCatalogEntry
        {
            CardId = "N-001",
            DisplayName = "Card A",
            Type = CardType.Character,
            Color = CardColor.Red,
            Description = "desc",
            NameJson = "[]",
            TraitsJson = "[]",
            ConditionsJson = "[]",
            EffectsJson = "[]",
            CreatedAtUtc = DateTimeOffset.UtcNow,
            UpdatedAtUtc = DateTimeOffset.UtcNow
        };
        dbContext.CardCatalogEntries.Add(cardA);

        dbContext.Decks.AddRange(
            new Deck
            {
                Type = DeckType.User,
                UserId = userId,
                Cards =
                [
                    new DeckCard
                    {
                        CardCatalogEntry = cardA,
                        Quantity = 1
                    }
                ]
            },
            new Deck
            {
                Type = DeckType.User,
                UserId = otherUserId,
                Cards =
                [
                    new DeckCard
                    {
                        CardCatalogEntry = cardA,
                        Quantity = 1
                    }
                ]
            });

        await dbContext.SaveChangesAsync();

        var service = new DeckService(dbContext);
        var result = await service.GetDecks(userId);

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(1, result.Value.Count);
        Assert.AreEqual("User", result.Value[0].Type);
        Assert.AreEqual(userId, result.Value[0].UserId);
    }

    [TestMethod]
    public async Task GetDeck_WhenPopulateTrue_IncludesCardCatalogPayload()
    {
        await using var dbContext = CreateDbContext();

        var catalogEntry = new CardCatalogEntry
        {
            CardId = "N-200",
            Image = "https://example.com/n-200.webp",
            DisplayName = "Naruto",
            Type = CardType.ExCharacter,
            Color = CardColor.Blue,
            Description = "Desc",
            Damage = 2,
            Power = 4,
            NameJson = "[\"Naruto\"]",
            TraitsJson = "[\"Leaf\"]",
            ConditionsJson = "[{\"id\":\"condition-1\",\"args\":{\"x\":\"1\"}}]",
            EffectsJson = "[{\"id\":\"effect-1\",\"kind\":1,\"timing\":1,\"args\":{\"y\":\"2\"}}]",
            Life = 5,
            Health = 6,
            SupportName = "Support",
            SupportEffect = "Effect",
            CreatedAtUtc = DateTimeOffset.UtcNow,
            UpdatedAtUtc = DateTimeOffset.UtcNow
        };

        var deck = new Deck
        {
            Type = DeckType.Public,
            Cards =
            [
                new DeckCard
                {
                    CardCatalogEntry = catalogEntry,
                    Quantity = 3
                }
            ]
        };

        dbContext.Decks.Add(deck);
        await dbContext.SaveChangesAsync();

        var service = new DeckService(dbContext);
        var result = await service.GetDeck(deck.Id.ToString(), populate: true);

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(1, result.Value.Cards.Count);
        Assert.AreEqual("Public", result.Value.Type);

        var populatedCard = result.Value.Cards[0].Card;
        Assert.IsNotNull(populatedCard);
        Assert.AreEqual("N-200", populatedCard.Id);
        Assert.AreEqual("Naruto", populatedCard.DisplayName);
        Assert.AreEqual("EX Character", populatedCard.Type);
        Assert.AreEqual("Blue", populatedCard.Color);
        Assert.AreEqual(1, populatedCard.Name.Count);
        Assert.AreEqual(1, populatedCard.Traits.Count);
        Assert.AreEqual(1, populatedCard.Conditions.Count);
        Assert.AreEqual(1, populatedCard.Effects.Count);
    }

    [TestMethod]
    public async Task GetDecks_WhenPopulateTrue_IncludesCardCatalogPayloadForEachDeck()
    {
        await using var dbContext = CreateDbContext();

        var cardA = new CardCatalogEntry
        {
            CardId = "N-300",
            DisplayName = "Card 300",
            Type = CardType.Character,
            Color = CardColor.Red,
            Description = "desc",
            NameJson = "[]",
            TraitsJson = "[]",
            ConditionsJson = "[]",
            EffectsJson = "[]",
            CreatedAtUtc = DateTimeOffset.UtcNow,
            UpdatedAtUtc = DateTimeOffset.UtcNow
        };

        dbContext.Decks.AddRange(
            new Deck
            {
                Type = DeckType.Public,
                Cards =
                [
                    new DeckCard
                    {
                        CardCatalogEntry = cardA,
                        Quantity = 1
                    }
                ]
            },
            new Deck
            {
                Type = DeckType.Public,
                Cards =
                [
                    new DeckCard
                    {
                        CardCatalogEntry = cardA,
                        Quantity = 2
                    }
                ]
            });

        await dbContext.SaveChangesAsync();

        var service = new DeckService(dbContext);
        var result = await service.GetDecks(populate: true);

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(2, result.Value.Count);
        Assert.IsTrue(result.Value.All(deck => deck.Cards.All(card => card.Card is not null)));
    }

    [TestMethod]
    public async Task DeleteDeck_RemovesTheDeckAndItsCardRows()
    {
        await using var dbContext = CreateDbContext();

        var deck = new Deck
        {
            Type = DeckType.Public,
            Cards =
            [
                new DeckCard
                {
                    CardCatalogEntry = CreateCatalogEntry("N-400"),
                    Quantity = 2
                }
            ]
        };

        dbContext.Decks.Add(deck);
        await dbContext.SaveChangesAsync();

        var service = new DeckService(dbContext);
        var result = await service.DeleteDeck(deck.Id.ToString());

        Assert.IsFalse(result.IsError);
        Assert.IsTrue(result.Value);
        Assert.AreEqual(0, await dbContext.Decks.CountAsync());
        Assert.AreEqual(0, await dbContext.DeckCards.CountAsync());
    }

    [TestMethod]
    public async Task DeleteDeck_WhenDeckIsAssignedToAGame_ReturnsConflict()
    {
        await using var dbContext = CreateDbContext();

        var deck = new Deck
        {
            Type = DeckType.Public,
            Cards =
            [
                new DeckCard
                {
                    CardCatalogEntry = CreateCatalogEntry("N-401"),
                    Quantity = 1
                }
            ]
        };

        var otherDeck = new Deck { Type = DeckType.Public };

        dbContext.Decks.AddRange(deck, otherDeck);
        dbContext.GameInstances.Add(new GameInstanceEntity
        {
            JoinCode = "TEST1",
            Player1UserId = Guid.NewGuid(),
            Player2UserId = Guid.NewGuid(),
            Player1DeckId = deck.Id,
            Player2DeckId = otherDeck.Id
        });
        await dbContext.SaveChangesAsync();

        var service = new DeckService(dbContext);
        var result = await service.DeleteDeck(deck.Id.ToString());

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Deck.Delete.InUse", result.FirstError.Code);
        Assert.AreEqual(2, await dbContext.Decks.CountAsync());
    }

    [TestMethod]
    public async Task DeleteDeck_WhenDeckIsUnknown_ReturnsNotFound()
    {
        await using var dbContext = CreateDbContext();
        var service = new DeckService(dbContext);

        var result = await service.DeleteDeck(Guid.NewGuid().ToString());

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Deck.Delete.NotFound", result.FirstError.Code);
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
            UpdatedAtUtc = DateTimeOffset.UtcNow
        };
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: $"deck-service-tests-{Guid.NewGuid()}")
            .Options;

        return new ApplicationDbContext(options);
    }
}
