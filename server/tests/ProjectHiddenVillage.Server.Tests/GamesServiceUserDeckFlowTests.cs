using Microsoft.EntityFrameworkCore;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Data;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class GamesServiceUserDeckFlowTests
{
    [TestMethod]
    public async Task CreateGameForUser_CreatesSinglePlayerGameWithJoinCode()
    {
        await using var dbContext = CreateDbContext();

        var user = CreateUser("u1@example.com", "user1");
        var cardA = CreateCatalogEntry("N-001", "Card A");
        var cardB = CreateCatalogEntry("N-002", "Card B");

        dbContext.Users.Add(user);
        dbContext.Decks.Add(CreateDeck(user.Id, [
            (cardA, 2),
            (cardB, 1)
        ]));
        await dbContext.SaveChangesAsync();

        var deckId = await dbContext.Decks.Select(deck => deck.Id).SingleAsync();
        var service = CreateService(dbContext);

        var result = await service.CreateGameForUser(new CreateGameForUserRequest(user.Id, deckId));

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(5, result.Value.Id.Length);
        Assert.AreEqual(1, result.Value.State.Players.Count);
        Assert.AreEqual(user.Id.ToString("N"), result.Value.State.Players[0].PlayerId);
        Assert.AreEqual(3, result.Value.State.Players[0].Deck.Count);
    }

    [TestMethod]
    public async Task JoinGameForUser_AllowsSecondPlayer_AndRejectsThirdPlayer()
    {
        await using var dbContext = CreateDbContext();

        var user1 = CreateUser("u1@example.com", "user1");
        var user2 = CreateUser("u2@example.com", "user2");
        var user3 = CreateUser("u3@example.com", "user3");

        var card1 = CreateCatalogEntry("N-010", "Card 10");
        var card2 = CreateCatalogEntry("N-011", "Card 11");
        var card3 = CreateCatalogEntry("N-012", "Card 12");

        dbContext.Users.AddRange(user1, user2, user3);
        dbContext.Decks.AddRange(
            CreateDeck(user1.Id, [(card1, 1)]),
            CreateDeck(user2.Id, [(card2, 1)]),
            CreateDeck(user3.Id, [(card3, 1)]));

        await dbContext.SaveChangesAsync();

        var deckIdsByUserId = await dbContext.Decks
            .AsNoTracking()
            .ToDictionaryAsync(deck => deck.UserId!.Value, deck => deck.Id);

        var service = CreateService(dbContext);

        var createResult = await service.CreateGameForUser(new CreateGameForUserRequest(user1.Id, deckIdsByUserId[user1.Id]));
        Assert.IsFalse(createResult.IsError);

        var joinResult = await service.JoinGameForUser(
            createResult.Value.Id,
            new JoinGameAsPlayer(user2.Id, deckIdsByUserId[user2.Id]));

        Assert.IsFalse(joinResult.IsError);
        Assert.AreEqual(2, joinResult.Value.State.Players.Count);

        var thirdJoinResult = await service.JoinGameForUser(
            createResult.Value.Id,
            new JoinGameAsPlayer(user3.Id, deckIdsByUserId[user3.Id]));

        Assert.IsTrue(thirdJoinResult.IsError);
        Assert.AreEqual("Game.JoinForUser.InvalidState", thirdJoinResult.FirstError.Code);
    }

    [TestMethod]
    public async Task JoinGameForUser_WhenUserAlreadyInGame_AllowsRejoinWithoutDeckId()
    {
        await using var dbContext = CreateDbContext();

        var user = CreateUser("rejoin@example.com", "rejoin-user");
        var card = CreateCatalogEntry("N-099", "Card 99");

        dbContext.Users.Add(user);
        dbContext.Decks.Add(CreateDeck(user.Id, [(card, 1)]));
        await dbContext.SaveChangesAsync();

        var deckId = await dbContext.Decks.Select(deck => deck.Id).SingleAsync();
        var service = CreateService(dbContext);

        var createResult = await service.CreateGameForUser(new CreateGameForUserRequest(user.Id, deckId));
        Assert.IsFalse(createResult.IsError);

        var rejoinResult = await service.JoinGameForUser(
            createResult.Value.Id,
            new JoinGameAsPlayer(user.Id, null));

        Assert.IsFalse(rejoinResult.IsError);
        Assert.AreEqual(createResult.Value.Id, rejoinResult.Value.Id);
        Assert.AreEqual(1, rejoinResult.Value.State.Players.Count);
        Assert.AreEqual(user.Id.ToString("N"), rejoinResult.Value.State.Players[0].PlayerId);
    }

    [TestMethod]
    public async Task JoinGameForUser_WhenStoredDeckIsMissing_RejectsDecklessRejoin()
    {
        await using var dbContext = CreateDbContext();

        var user = CreateUser("missing-deck@example.com", "missing-deck-user");
        var card = CreateCatalogEntry("N-100", "Card 100");

        dbContext.Users.Add(user);
        dbContext.Decks.Add(CreateDeck(user.Id, [(card, 1)]));
        await dbContext.SaveChangesAsync();

        var deckId = await dbContext.Decks.Select(deck => deck.Id).SingleAsync();
        var service = CreateService(dbContext);

        var createResult = await service.CreateGameForUser(new CreateGameForUserRequest(user.Id, deckId));
        Assert.IsFalse(createResult.IsError);

        createResult.Value.State.Players[0].Deck.Clear();

        var rejoinResult = await service.JoinGameForUser(
            createResult.Value.Id,
            new JoinGameAsPlayer(user.Id, null));

        Assert.IsTrue(rejoinResult.IsError);
        Assert.AreEqual("Game.JoinForUser.MissingStoredDeck", rejoinResult.FirstError.Code);
    }

    [TestMethod]
    public async Task GetCardsForGame_ResolvesFromRuntimeGame_WhenDbGameRowDoesNotExist()
    {
        await using var dbContext = CreateDbContext();

        var user = CreateUser("runtime@example.com", "runtime-user");
        var cardA = CreateCatalogEntry("R-001", "Runtime Card A");
        var cardB = CreateCatalogEntry("R-002", "Runtime Card B");

        dbContext.Users.Add(user);
        dbContext.Decks.Add(CreateDeck(user.Id, [
            (cardA, 2),
            (cardB, 1)
        ]));
        await dbContext.SaveChangesAsync();

        var deckId = await dbContext.Decks.Select(deck => deck.Id).SingleAsync();
        var service = CreateService(dbContext);

        var createResult = await service.CreateGameForUser(new CreateGameForUserRequest(user.Id, deckId));
        Assert.IsFalse(createResult.IsError);

        var cardsResult = await service.GetCardsForGame(createResult.Value.Id);

        Assert.IsFalse(cardsResult.IsError);
        CollectionAssert.AreEquivalent(
            new[] { "R-001", "R-002" },
            cardsResult.Value.Select(card => card.Id).ToArray());
    }

    private static GamesService CreateService(ApplicationDbContext dbContext)
    {
        var registry = new InMemoryGameInstanceRegistry(
            new GameInstanceFactory(),
            new global::ProjectHiddenVillage.Server.Engine.GamePhaseService());

        return new GamesService(registry, new CardMappingService(dbContext), dbContext);
    }

    private static User CreateUser(string email, string username)
    {
        return new User
        {
            Email = email,
            Username = username,
            PasswordHash = "hash"
        };
    }

    private static Deck CreateDeck(Guid userId, IReadOnlyList<(CardCatalogEntry Card, int Quantity)> cards)
    {
        return new Deck
        {
            Type = DeckType.User,
            UserId = userId,
            Cards = cards.Select(card => new DeckCard
            {
                CardCatalogEntry = card.Card,
                Quantity = card.Quantity
            }).ToList()
        };
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
            .UseInMemoryDatabase(databaseName: $"games-service-user-flow-tests-{Guid.NewGuid()}")
            .Options;

        return new ApplicationDbContext(options);
    }
}
