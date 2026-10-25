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
        AddTestRuleset(dbContext, nonLeaderCardCount: 6, leaderCount: 0);
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
        AddTestRuleset(dbContext, nonLeaderCardCount: 2, leaderCount: 0);

        await dbContext.SaveChangesAsync();

        var service = new DeckService(dbContext);
        var result = await service.CreateDeck(new CreateDeckRequest(
            Type: DeckType.Public,
            Cards: "1x N-100\n1x N-101"));

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Deck.Ruleset.NotLegalInAnyRuleset", result.FirstError.Code);
        StringAssert.Contains(result.FirstError.Description, "Chakra");
    }

    [TestMethod]
    public async Task CreateDeck_IgnoresCommentAndBlankLines()
    {
        await using var dbContext = CreateDbContext();
        dbContext.CardCatalogEntries.AddRange(
            CreateCatalogEntry("L-600", CardType.Leader, CardColor.Red),
            CreateCatalogEntry("C-600", CardType.Character, CardColor.Red));
        AddTestRuleset(dbContext, nonLeaderCardCount: 2);
        await dbContext.SaveChangesAsync();

        var service = new DeckService(dbContext);
        var result = await service.CreateDeck(new CreateDeckRequest(
            Type: DeckType.Public,
            Cards: "// Main Deck\n\n1x L-600\n2x C-600 // two copies\n"));

        Assert.IsFalse(result.IsError, result.IsError ? result.FirstError.Description : string.Empty);

        var deckId = Guid.Parse(result.Value);
        var persistedDeck = await dbContext.Decks
            .Include(deck => deck.Cards)
            .SingleAsync(deck => deck.Id == deckId);

        Assert.AreEqual(2, persistedDeck.Cards.Count);
    }

    [TestMethod]
    public async Task CreateDeck_PersistsTheProvidedName()
    {
        await using var dbContext = CreateDbContext();
        dbContext.CardCatalogEntries.AddRange(
            CreateCatalogEntry("L-601", CardType.Leader, CardColor.Red),
            CreateCatalogEntry("C-601", CardType.Character, CardColor.Red));
        AddTestRuleset(dbContext, nonLeaderCardCount: 1);
        await dbContext.SaveChangesAsync();

        var service = new DeckService(dbContext);
        var result = await service.CreateDeck(new CreateDeckRequest(
            Type: DeckType.Public,
            Cards: "1x L-601\n1x C-601",
            Name: "  Imported Deck  "));

        Assert.IsFalse(result.IsError, result.IsError ? result.FirstError.Description : string.Empty);

        var deckId = Guid.Parse(result.Value);
        var persistedDeck = await dbContext.Decks.SingleAsync(deck => deck.Id == deckId);

        Assert.AreEqual("Imported Deck", persistedDeck.Name);
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

    [TestMethod]
    public async Task CreatePublicDeck_PersistsTheTrimmedNameAndCardRows()
    {
        await using var dbContext = CreateDbContext();
        dbContext.CardCatalogEntries.AddRange(
            CreateCatalogEntry("L-100", CardType.Leader, CardColor.Red),
            CreateCatalogEntry("C-100", CardType.Character, CardColor.Red));
        AddTestRuleset(dbContext, nonLeaderCardCount: 4);
        await dbContext.SaveChangesAsync();

        var service = new DeckService(dbContext);
        var result = await service.CreatePublicDeckAsync(new CreatePublicDeckRequest(
            Name: "  Starter Red  ",
            Cards:
            [
                new DeckCardRequest("L-100", 1),
                new DeckCardRequest("C-100", 4),
            ]));

        Assert.IsFalse(result.IsError, result.IsError ? result.FirstError.Description : string.Empty);
        Assert.AreEqual("Starter Red", result.Value.Name);
        Assert.AreEqual(nameof(DeckType.Public), result.Value.Type);
        Assert.AreEqual(2, result.Value.Cards.Count);

        var persistedDeck = await dbContext.Decks
            .Include(deck => deck.Cards)
            .SingleAsync(deck => deck.Id == result.Value.Id);

        Assert.AreEqual("Starter Red", persistedDeck.Name);
        Assert.AreEqual(DeckType.Public, persistedDeck.Type);
        Assert.AreEqual(2, persistedDeck.Cards.Count);
    }

    [TestMethod]
    public async Task CreatePublicDeck_ReturnsTheRuleViolationAndPersistsNothing()
    {
        await using var dbContext = CreateDbContext();
        dbContext.CardCatalogEntries.Add(CreateCatalogEntry("C-100", CardType.Character, CardColor.Red));
        AddTestRuleset(dbContext, nonLeaderCardCount: 1);
        await dbContext.SaveChangesAsync();

        var service = new DeckService(dbContext);
        var result = await service.CreatePublicDeckAsync(new CreatePublicDeckRequest(
            Name: "Leaderless",
            Cards: [new DeckCardRequest("C-100", 1)]));

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Deck.Ruleset.NotLegalInAnyRuleset", result.FirstError.Code);
        StringAssert.Contains(result.FirstError.Description, "leader");
        Assert.AreEqual(0, await dbContext.Decks.CountAsync());
    }

    [TestMethod]
    public async Task UpdateDeck_ReplacesTheNameAndEveryCardRow()
    {
        await using var dbContext = CreateDbContext();
        var leader = CreateCatalogEntry("L-200", CardType.Leader, CardColor.Blue);
        var character = CreateCatalogEntry("C-200", CardType.Character, CardColor.Blue);
        var retired = CreateCatalogEntry("C-201", CardType.Character, CardColor.Blue);
        dbContext.CardCatalogEntries.AddRange(leader, character, retired);
        AddTestRuleset(dbContext, nonLeaderCardCount: 3);

        var deck = new Deck
        {
            Type = DeckType.Public,
            Name = "Before",
            Cards =
            [
                new DeckCard { CardCatalogEntry = retired, Quantity = 2 },
            ],
        };
        dbContext.Decks.Add(deck);
        await dbContext.SaveChangesAsync();

        var service = new DeckService(dbContext);
        var result = await service.UpdateDeckAsync(deck.Id.ToString(), new UpdateDeckRequest(
            Name: "After",
            Cards:
            [
                new DeckCardRequest("L-200", 1),
                new DeckCardRequest("C-200", 3),
            ]));

        Assert.IsFalse(result.IsError, result.IsError ? result.FirstError.Description : string.Empty);
        Assert.AreEqual("After", result.Value.Name);
        Assert.AreEqual(2, result.Value.Cards.Count);

        var persistedDeck = await dbContext.Decks
            .Include(record => record.Cards)
            .SingleAsync(record => record.Id == deck.Id);

        Assert.AreEqual("After", persistedDeck.Name);
        Assert.AreEqual(2, persistedDeck.Cards.Count);
        Assert.AreEqual(DeckType.Public, persistedDeck.Type);

        var quantitiesByCatalogEntryId = persistedDeck.Cards
            .ToDictionary(card => card.CardCatalogEntryId, card => card.Quantity);

        Assert.AreEqual(1, quantitiesByCatalogEntryId[leader.Id]);
        Assert.AreEqual(3, quantitiesByCatalogEntryId[character.Id]);
        Assert.IsFalse(quantitiesByCatalogEntryId.ContainsKey(retired.Id));
    }

    [TestMethod]
    public async Task UpdateDeck_KeepsTheStoredDeckWhenARuleFails()
    {
        await using var dbContext = CreateDbContext();
        var leader = CreateCatalogEntry("L-300", CardType.Leader, CardColor.Green);
        var offColor = CreateCatalogEntry("C-300", CardType.Character, CardColor.Red);
        dbContext.CardCatalogEntries.AddRange(leader, offColor);
        AddTestRuleset(dbContext, nonLeaderCardCount: 1);

        var deck = new Deck
        {
            Type = DeckType.Public,
            Name = "Kept",
            Cards =
            [
                new DeckCard { CardCatalogEntry = leader, Quantity = 1 },
            ],
        };
        dbContext.Decks.Add(deck);
        await dbContext.SaveChangesAsync();

        var service = new DeckService(dbContext);
        var result = await service.UpdateDeckAsync(deck.Id.ToString(), new UpdateDeckRequest(
            Name: "Rejected",
            Cards:
            [
                new DeckCardRequest("L-300", 1),
                new DeckCardRequest("C-300", 1),
            ]));

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Deck.Ruleset.NotLegalInAnyRuleset", result.FirstError.Code);
        StringAssert.Contains(result.FirstError.Description, "colour");

        var persistedDeck = await dbContext.Decks
            .Include(record => record.Cards)
            .SingleAsync(record => record.Id == deck.Id);

        Assert.AreEqual("Kept", persistedDeck.Name);
        Assert.AreEqual(1, persistedDeck.Cards.Count);
    }

    [TestMethod]
    public async Task UpdateDeck_WhenTheDeckIsUnknown_ReturnsNotFound()
    {
        await using var dbContext = CreateDbContext();
        var service = new DeckService(dbContext);

        var result = await service.UpdateDeckAsync(Guid.NewGuid().ToString(), new UpdateDeckRequest(
            Name: "Missing",
            Cards: [new DeckCardRequest("N-001", 1)]));

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Deck.Update.NotFound", result.FirstError.Code);
    }

    [TestMethod]
    public async Task GetDecks_ReportsTheLeaderColorForTheRail()
    {
        await using var dbContext = CreateDbContext();
        var leader = CreateCatalogEntry("L-500", CardType.Leader, CardColor.Blue);
        var character = CreateCatalogEntry("C-500", CardType.Character, CardColor.Blue);
        dbContext.CardCatalogEntries.AddRange(leader, character);

        var leaderDeck = new Deck
        {
            Type = DeckType.Public,
            Name = "Leader deck",
            Cards =
            [
                new DeckCard { CardCatalogEntry = leader, Quantity = 1 },
                new DeckCard { CardCatalogEntry = character, Quantity = 2 },
            ],
        };
        var leaderlessDeck = new Deck
        {
            Type = DeckType.Public,
            Name = "Leaderless deck",
            Cards = [new DeckCard { CardCatalogEntry = character, Quantity = 1 }],
        };

        dbContext.Decks.AddRange(leaderDeck, leaderlessDeck);
        await dbContext.SaveChangesAsync();

        var service = new DeckService(dbContext);
        var result = await service.GetDecks(type: DeckType.Public);

        Assert.IsFalse(result.IsError);
        var decksByName = result.Value.ToDictionary(deck => deck.Name);
        Assert.AreEqual("Blue", decksByName["Leader deck"].LeaderColor);
        Assert.IsNull(decksByName["Leaderless deck"].LeaderColor);

        var populated = await service.GetDeck(leaderDeck.Id.ToString(), populate: true);
        Assert.IsFalse(populated.IsError);
        Assert.AreEqual("Blue", populated.Value.LeaderColor);
    }

    [TestMethod]
    public async Task UpdateDeck_UpdatesARetainedCardInPlace()
    {
        await using var dbContext = CreateDbContext();
        var leader = CreateCatalogEntry("L-350", CardType.Leader, CardColor.Red);
        var retained = CreateCatalogEntry("C-350", CardType.Character, CardColor.Red);
        dbContext.CardCatalogEntries.AddRange(leader, retained);
        AddTestRuleset(dbContext, nonLeaderCardCount: 4);

        var deck = new Deck
        {
            Type = DeckType.Public,
            Name = "Retained",
            Cards =
            [
                new DeckCard { CardCatalogEntry = leader, Quantity = 1 },
                new DeckCard { CardCatalogEntry = retained, Quantity = 2 },
            ],
        };
        dbContext.Decks.Add(deck);
        await dbContext.SaveChangesAsync();

        var retainedRowId = deck.Cards.Single(card => card.CardCatalogEntryId == retained.Id).Id;

        var service = new DeckService(dbContext);
        var result = await service.UpdateDeckAsync(deck.Id.ToString(), new UpdateDeckRequest(
            Name: "Retained",
            Cards:
            [
                new DeckCardRequest("L-350", 1),
                new DeckCardRequest("C-350", 4),
            ]));

        Assert.IsFalse(result.IsError, result.IsError ? result.FirstError.Description : string.Empty);

        var cardRows = await dbContext.DeckCards
            .Where(card => card.DeckId == deck.Id)
            .ToListAsync();

        Assert.AreEqual(2, cardRows.Count);
        var retainedRow = cardRows.Single(card => card.CardCatalogEntryId == retained.Id);
        Assert.AreEqual(retainedRowId, retainedRow.Id);
        Assert.AreEqual(4, retainedRow.Quantity);
    }

    [TestMethod]
    public async Task GetDecks_FiltersByDeckType()
    {
        await using var dbContext = CreateDbContext();
        dbContext.Decks.AddRange(
            new Deck { Type = DeckType.Public, Name = "Public deck" },
            new Deck { Type = DeckType.User, Name = "Player deck", UserId = Guid.NewGuid() });
        await dbContext.SaveChangesAsync();

        var service = new DeckService(dbContext);
        var result = await service.GetDecks(type: DeckType.Public);

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(1, result.Value.Count);
        Assert.AreEqual("Public deck", result.Value[0].Name);
        Assert.AreEqual(nameof(DeckType.Public), result.Value[0].Type);
    }

    private static void AddTestRuleset(
        ApplicationDbContext dbContext,
        int nonLeaderCardCount,
        int maxCopies = 4,
        int leaderCount = 1)
    {
        dbContext.DeckRulesets.Add(new DeckRuleset
        {
            Key = $"test-{Guid.NewGuid():N}",
            Name = "Test Ruleset",
            IsActive = true,
            LeaderCount = leaderCount,
            NonLeaderCardCount = nonLeaderCardCount,
            MaxCopiesPerNonLeaderCard = maxCopies,
            RequireLeaderColorMatch = true,
            AllowChakraCards = false,
            AllowSummonCards = false,
            SortOrder = 0,
            CreatedAtUtc = DateTimeOffset.UtcNow,
            UpdatedAtUtc = DateTimeOffset.UtcNow,
        });
    }

    private static CardCatalogEntry CreateCatalogEntry(
        string cardId,
        CardType type = CardType.Character,
        CardColor color = CardColor.Red)
    {
        return new CardCatalogEntry
        {
            CardId = cardId,
            DisplayName = cardId,
            Type = type,
            Color = color,
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
