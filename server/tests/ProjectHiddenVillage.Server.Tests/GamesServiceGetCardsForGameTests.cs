using Microsoft.EntityFrameworkCore;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Data;
using ProjectHiddenVillage.Server.Data.Entities;
using GameInstanceEntity = ProjectHiddenVillage.Server.Data.Entities.GameInstance;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class GamesServiceGetCardsForGameTests
{
    [TestMethod]
    public async Task GetCardsForGame_ReturnsCombinedCardsFromAssignedPlayerDecks()
    {
        await using var dbContext = CreateDbContext();
        var playerOneCard = CreateCatalogEntry("P1-001", "Player One Card");
        var playerTwoCard = CreateCatalogEntry("P2-001", "Player Two Card");
        dbContext.CardCatalogEntries.AddRange(playerOneCard, playerTwoCard);

        var gameEntity = CreatePersistedGameInstance(
            player1DeckCards: [playerOneCard],
            player2DeckCards: [playerTwoCard]);
        dbContext.GameInstances.Add(gameEntity);

        await dbContext.SaveChangesAsync();

        var service = new GamesService(CreateRegistry(), new CardMappingService(dbContext), dbContext);

        var result = await service.GetCardsForGame(gameEntity.JoinCode);

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(2, result.Value.Count);
        CollectionAssert.AreEquivalent(new[] { "P1-001", "P2-001" }, result.Value.Select(card => card.Id).ToArray());
    }

    [TestMethod]
    public async Task GetCardsForGame_DeduplicatesCardsAcrossPlayers()
    {
        await using var dbContext = CreateDbContext();
        var sharedCard = CreateCatalogEntry("SHARED-001", "Shared Card");
        var playerTwoOnly = CreateCatalogEntry("P2-ONLY-001", "Player Two Only Card");
        dbContext.CardCatalogEntries.AddRange(sharedCard, playerTwoOnly);

        var gameEntity = CreatePersistedGameInstance(
            player1DeckCards: [sharedCard],
            player2DeckCards: [sharedCard, playerTwoOnly]);
        dbContext.GameInstances.Add(gameEntity);

        await dbContext.SaveChangesAsync();

        var service = new GamesService(CreateRegistry(), new CardMappingService(dbContext), dbContext);

        var result = await service.GetCardsForGame(gameEntity.JoinCode);

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(2, result.Value.Count);
        CollectionAssert.AreEquivalent(
            new[] { "SHARED-001", "P2-ONLY-001" },
            result.Value.Select(card => card.Id).ToArray());
    }

    [TestMethod]
    public async Task GetCardsForGame_IgnoresRuntimeStateOnlyCards_WhenLoadingCatalog()
    {
        await using var dbContext = CreateDbContext();
        var deckCard = CreateCatalogEntry("DECK-001", "Deck Card");
        var runtimeOnlyCard = CreateCatalogEntry("RUNTIME-ONLY-001", "Runtime Only Card");
        dbContext.CardCatalogEntries.AddRange(deckCard, runtimeOnlyCard);

        var gameEntity = CreatePersistedGameInstance(
            player1DeckCards: [deckCard],
            player2DeckCards: [],
            player1RuntimeCardIds: ["RUNTIME-ONLY-001"],
            player2RuntimeCardIds: ["RUNTIME-ONLY-001"]);
        dbContext.GameInstances.Add(gameEntity);

        await dbContext.SaveChangesAsync();

        var service = new GamesService(CreateRegistry(), new CardMappingService(dbContext), dbContext);

        var result = await service.GetCardsForGame(gameEntity.JoinCode);

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(1, result.Value.Count);
        Assert.AreEqual("DECK-001", result.Value[0].Id);
    }

    [TestMethod]
    public async Task GetCardsForGame_ReturnsValidationError_WhenGameIdIsBlank()
    {
        await using var dbContext = CreateDbContext();
        var service = new GamesService(CreateRegistry(), new CardMappingService(dbContext), dbContext);

        var result = await service.GetCardsForGame("   ");

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Game.GetById.MissingId", result.FirstError.Code);
    }

    [TestMethod]
    public async Task GetCardsForGame_ReturnsNotFound_WhenGameIsUnknown()
    {
        await using var dbContext = CreateDbContext();
        var service = new GamesService(CreateRegistry(), new CardMappingService(dbContext), dbContext);

        var result = await service.GetCardsForGame("missing-game");

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Game.NotFound", result.FirstError.Code);
    }

    private static InMemoryGameInstanceRegistry CreateRegistry()
    {
        return new InMemoryGameInstanceRegistry(
            new GameInstanceFactory(),
            new global::ProjectHiddenVillage.Server.Engine.GamePhaseService());
    }

    private static GameInstanceEntity CreatePersistedGameInstance(
        IReadOnlyList<CardCatalogEntry> player1DeckCards,
        IReadOnlyList<CardCatalogEntry> player2DeckCards,
        IReadOnlyList<string>? player1RuntimeCardIds = null,
        IReadOnlyList<string>? player2RuntimeCardIds = null)
    {
        var player1 = new User
        {
            Email = "p1@example.com",
            Username = "player1",
            PasswordHash = "hash"
        };

        var player2 = new User
        {
            Email = "p2@example.com",
            Username = "player2",
            PasswordHash = "hash"
        };

        var player1Deck = new Deck
        {
            Type = DeckType.Public,
            Cards = player1DeckCards
                .Select(card => new DeckCard
                {
                    CardCatalogEntry = card,
                    CardCatalogEntryId = card.Id,
                    Quantity = 1
                })
                .ToList()
        };

        var player2Deck = new Deck
        {
            Type = DeckType.Public,
            Cards = player2DeckCards
                .Select(card => new DeckCard
                {
                    CardCatalogEntry = card,
                    CardCatalogEntryId = card.Id,
                    Quantity = 1
                })
                .ToList()
        };

        var entity = new GameInstanceEntity
        {
            Id = Guid.NewGuid(),
            JoinCode = CreateJoinCode(),
            Player1User = player1,
            Player1UserId = player1.Id,
            Player2User = player2,
            Player2UserId = player2.Id,
            Player1Deck = player1Deck,
            Player1DeckId = player1Deck.Id,
            Player2Deck = player2Deck,
            Player2DeckId = player2Deck.Id
        };

        entity.Player1RuntimeDeckCards = (player1RuntimeCardIds ?? [])
            .Select((cardId, index) => new Player1RuntimeDeckCard
            {
                CardId = cardId,
                Position = index,
                GameInstance = entity,
                GameInstanceId = entity.Id
            })
            .ToList();

        entity.Player2RuntimeDeckCards = (player2RuntimeCardIds ?? [])
            .Select((cardId, index) => new Player2RuntimeDeckCard
            {
                CardId = cardId,
                Position = index,
                GameInstance = entity,
                GameInstanceId = entity.Id
            })
            .ToList();

        return entity;
    }

    private static string CreateJoinCode()
    {
        const string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        var random = Random.Shared;

        return string.Create(5, random, static (buffer, rng) =>
        {
            for (var index = 0; index < buffer.Length; index++)
            {
                buffer[index] = alphabet[rng.Next(alphabet.Length)];
            }
        });
    }

    private static CardCatalogEntry CreateCatalogEntry(string cardId, string displayName)
    {
        return new CardCatalogEntry
        {
            CardId = cardId,
            Image = $"https://example.com/{cardId.ToLowerInvariant()}.webp",
            OriginalId = cardId,
            DisplayName = displayName,
            Type = CardType.Character,
            Color = CardColor.Red,
            Description = "desc",
            NameJson = $"[\"{displayName}\"]",
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
            .UseInMemoryDatabase(databaseName: $"games-service-cards-tests-{Guid.NewGuid()}")
            .Options;

        return new ApplicationDbContext(options);
    }
}
