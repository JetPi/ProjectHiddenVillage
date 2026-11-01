using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.Games;
using ProjectHiddenVillage.Server.Api.Services.Matchmaking;
using ProjectHiddenVillage.Server.Data;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class MatchmakingServiceTests
{
    private const int StandardDeckSize = 2;
    private const int PreReleaseDeckSize = 3;

    private static readonly DateTimeOffset ReferenceNow = new(2026, 10, 26, 12, 0, 0, TimeSpan.Zero);

    [TestMethod]
    public async Task EnqueueAsync_PairsAPlayerWithAnotherWhoQueuedForTheSameRuleset()
    {
        var clock = new StubTimeProvider(ReferenceNow);
        await using var dbContext = CreateDbContext();
        var harness = CreateHarness(dbContext, clock);
        var (registered, guest) = SeedPlayers(dbContext);
        var ruleset = await SeedRulesetsAsync(dbContext, harness);
        await dbContext.SaveChangesAsync();

        var firstTicket = await harness.Matchmaking.EnqueueAsync(new EnqueueMatchRequest(
            registered.Id,
            await DeckIdForAsync(dbContext, registered.Id),
            ruleset.StandardId));

        Assert.IsFalse(firstTicket.IsError, firstTicket.IsError ? firstTicket.FirstError.Description : string.Empty);
        Assert.AreEqual(MatchTicketStates.Waiting, firstTicket.Value.State);
        Assert.IsNull(firstTicket.Value.GameId);

        var secondTicket = await harness.Matchmaking.EnqueueAsync(new EnqueueMatchRequest(
            guest.Id,
            await DeckIdForAsync(dbContext, guest.Id),
            ruleset.StandardId));

        Assert.IsFalse(secondTicket.IsError, secondTicket.IsError ? secondTicket.FirstError.Description : string.Empty);
        Assert.AreEqual(MatchTicketStates.Matched, secondTicket.Value.State);
        Assert.IsFalse(string.IsNullOrWhiteSpace(secondTicket.Value.GameId));
        Assert.AreEqual(registered.Username, secondTicket.Value.OpponentName);

        var firstTicketAfterMatch = harness.Matchmaking.GetTicket(firstTicket.Value.TicketId, registered.Id);
        Assert.IsFalse(firstTicketAfterMatch.IsError);
        Assert.AreEqual(MatchTicketStates.Matched, firstTicketAfterMatch.Value.State);
        Assert.AreEqual(secondTicket.Value.GameId, firstTicketAfterMatch.Value.GameId);

        Assert.IsTrue(harness.Registry.TryGet(secondTicket.Value.GameId!, out var game));
        Assert.IsNotNull(game);
        Assert.AreEqual(2, game.State.Players.Count);
        Assert.IsNotNull(game.Ruleset);
        Assert.AreEqual(ruleset.StandardId, game.Ruleset.Id);
        Assert.AreEqual("standard", game.Ruleset.Key);
    }

    [TestMethod]
    public async Task EnqueueAsync_NeverPairsPlayersWhoQueuedForDifferentRulesets()
    {
        var clock = new StubTimeProvider(ReferenceNow);
        await using var dbContext = CreateDbContext();
        var harness = CreateHarness(dbContext, clock);
        var (playerOne, playerTwo) = SeedPlayers(dbContext);
        var ruleset = await SeedRulesetsAsync(dbContext, harness);
        await dbContext.SaveChangesAsync();

        var preReleasePlayer = await AddPlayerWithDeckAsync(
            dbContext,
            "PreRelease",
            "pre-release@example.com",
            nonLeaderCopies: 3);

        var firstTicket = await harness.Matchmaking.EnqueueAsync(new EnqueueMatchRequest(
            playerOne.Id,
            await DeckIdForAsync(dbContext, playerOne.Id),
            ruleset.StandardId));

        var secondTicket = await harness.Matchmaking.EnqueueAsync(new EnqueueMatchRequest(
            preReleasePlayer.Id,
            await DeckIdForAsync(dbContext, preReleasePlayer.Id),
            ruleset.PreReleaseId));

        Assert.IsFalse(firstTicket.IsError);
        Assert.IsFalse(secondTicket.IsError, secondTicket.IsError ? secondTicket.FirstError.Description : string.Empty);
        Assert.AreEqual(MatchTicketStates.Waiting, firstTicket.Value.State);
        Assert.AreEqual(MatchTicketStates.Waiting, secondTicket.Value.State);
        Assert.IsNull(secondTicket.Value.GameId);
    }

    [TestMethod]
    public async Task EnqueueAsync_RefusesARulesetThatIsNotQuickMatchable()
    {
        var clock = new StubTimeProvider(ReferenceNow);
        await using var dbContext = CreateDbContext();
        var harness = CreateHarness(dbContext, clock);
        var (playerOne, _) = SeedPlayers(dbContext);
        await dbContext.SaveChangesAsync();

        // Same deck rules as the standard format, but the admin marked it host-only: playable through hosting and
        // invites, never offered by the matchmaker.
        var hostOnly = await harness.Rulesets.CreateRuleset(new CreateDeckRulesetRequest(
            Key: "invite-only",
            Name: "Invite Only",
            IsActive: true,
            CardPoolMode: CardPoolMode.Open,
            LeaderCount: 1,
            NonLeaderCardCount: StandardDeckSize,
            MaxCopiesPerNonLeaderCard: 4,
            RequireLeaderColorMatch: false,
            AllowChakraCards: true,
            AllowSummonCards: true,
            SortOrder: 2,
            CardRestrictions: [],
            AvailableInQuickMatch: false));

        Assert.IsFalse(hostOnly.IsError, hostOnly.IsError ? hostOnly.FirstError.Description : string.Empty);

        var result = await harness.Matchmaking.EnqueueAsync(new EnqueueMatchRequest(
            playerOne.Id,
            await DeckIdForAsync(dbContext, playerOne.Id),
            hostOnly.Value.Id));

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Matchmaking.Enqueue.RulesetNotQuickMatch", result.FirstError.Code);
    }

    [TestMethod]
    public async Task EnqueueAsync_RejectsADeckThatDoesNotFitTheRuleset()
    {
        var clock = new StubTimeProvider(ReferenceNow);
        await using var dbContext = CreateDbContext();
        var harness = CreateHarness(dbContext, clock);
        var (playerOne, _) = SeedPlayers(dbContext);
        var ruleset = await SeedRulesetsAsync(dbContext, harness);
        await dbContext.SaveChangesAsync();

        // The seeded deck holds two non-leader cards, which is a Pre-Release size of three minus one.
        var result = await harness.Matchmaking.EnqueueAsync(new EnqueueMatchRequest(
            playerOne.Id,
            await DeckIdForAsync(dbContext, playerOne.Id),
            ruleset.PreReleaseId));

        Assert.IsTrue(result.IsError);
        Assert.AreEqual(GameRulesetDeckValidator.DeckIllegalCode, result.FirstError.Code);
    }

    [TestMethod]
    public async Task EnqueueAsync_ReplacesThePlayersPreviousTicket()
    {
        var clock = new StubTimeProvider(ReferenceNow);
        await using var dbContext = CreateDbContext();
        var harness = CreateHarness(dbContext, clock);
        var (playerOne, _) = SeedPlayers(dbContext);
        var ruleset = await SeedRulesetsAsync(dbContext, harness);
        await dbContext.SaveChangesAsync();

        var deckId = await DeckIdForAsync(dbContext, playerOne.Id);
        var firstTicket = await harness.Matchmaking.EnqueueAsync(
            new EnqueueMatchRequest(playerOne.Id, deckId, ruleset.StandardId));
        var secondTicket = await harness.Matchmaking.EnqueueAsync(
            new EnqueueMatchRequest(playerOne.Id, deckId, ruleset.StandardId));

        Assert.IsFalse(firstTicket.IsError);
        Assert.IsFalse(secondTicket.IsError);
        Assert.AreNotEqual(firstTicket.Value.TicketId, secondTicket.Value.TicketId);

        var replaced = harness.Matchmaking.GetTicket(firstTicket.Value.TicketId, playerOne.Id);
        Assert.IsTrue(replaced.IsError);
        Assert.AreEqual("Matchmaking.Ticket.NotFound", replaced.FirstError.Code);
    }

    [TestMethod]
    public async Task GetTicket_IsOnlyReadableByItsOwner()
    {
        var clock = new StubTimeProvider(ReferenceNow);
        await using var dbContext = CreateDbContext();
        var harness = CreateHarness(dbContext, clock);
        var (playerOne, playerTwo) = SeedPlayers(dbContext);
        var ruleset = await SeedRulesetsAsync(dbContext, harness);
        await dbContext.SaveChangesAsync();

        var ticket = await harness.Matchmaking.EnqueueAsync(new EnqueueMatchRequest(
            playerOne.Id,
            await DeckIdForAsync(dbContext, playerOne.Id),
            ruleset.StandardId));

        Assert.IsFalse(ticket.IsError);

        var foreignRead = harness.Matchmaking.GetTicket(ticket.Value.TicketId, playerTwo.Id);

        Assert.IsTrue(foreignRead.IsError);
        Assert.AreEqual("Matchmaking.Ticket.Forbidden", foreignRead.FirstError.Code);
    }

    [TestMethod]
    public async Task Cancel_ReleasesAWaitingSlot()
    {
        var clock = new StubTimeProvider(ReferenceNow);
        await using var dbContext = CreateDbContext();
        var harness = CreateHarness(dbContext, clock);
        var (playerOne, playerTwo) = SeedPlayers(dbContext);
        var ruleset = await SeedRulesetsAsync(dbContext, harness);
        await dbContext.SaveChangesAsync();

        var ticket = await harness.Matchmaking.EnqueueAsync(new EnqueueMatchRequest(
            playerOne.Id,
            await DeckIdForAsync(dbContext, playerOne.Id),
            ruleset.StandardId));

        Assert.IsFalse(ticket.IsError);

        var cancelled = harness.Matchmaking.Cancel(ticket.Value.TicketId, playerOne.Id);

        Assert.IsFalse(cancelled.IsError);
        Assert.AreEqual(MatchTicketStates.Cancelled, cancelled.Value.State);

        var opponent = await harness.Matchmaking.EnqueueAsync(new EnqueueMatchRequest(
            playerTwo.Id,
            await DeckIdForAsync(dbContext, playerTwo.Id),
            ruleset.StandardId));

        Assert.IsFalse(opponent.IsError);
        Assert.AreEqual(
            MatchTicketStates.Waiting,
            opponent.Value.State,
            "A cancelled ticket must never be paired with a later player.");
    }

    [TestMethod]
    public async Task EnqueueAsync_ExpiresWaitingTicketsAfterTheirLifetime()
    {
        var clock = new StubTimeProvider(ReferenceNow);
        await using var dbContext = CreateDbContext();
        var harness = CreateHarness(dbContext, clock);
        var (playerOne, playerTwo) = SeedPlayers(dbContext);
        var ruleset = await SeedRulesetsAsync(dbContext, harness);
        await dbContext.SaveChangesAsync();

        var staleTicket = await harness.Matchmaking.EnqueueAsync(new EnqueueMatchRequest(
            playerOne.Id,
            await DeckIdForAsync(dbContext, playerOne.Id),
            ruleset.StandardId));

        Assert.IsFalse(staleTicket.IsError);

        clock.UtcNow = ReferenceNow.AddMinutes(10);

        var opponent = await harness.Matchmaking.EnqueueAsync(new EnqueueMatchRequest(
            playerTwo.Id,
            await DeckIdForAsync(dbContext, playerTwo.Id),
            ruleset.StandardId));

        Assert.IsFalse(opponent.IsError);
        Assert.AreEqual(MatchTicketStates.Waiting, opponent.Value.State);

        var staleAfterExpiry = harness.Matchmaking.GetTicket(staleTicket.Value.TicketId, playerOne.Id);
        Assert.IsFalse(staleAfterExpiry.IsError);
        Assert.AreEqual(MatchTicketStates.Expired, staleAfterExpiry.Value.State);
    }

    [TestMethod]
    public async Task JoinGameForUser_RejectsADeckThatDoesNotFitTheGamesRuleset()
    {
        var clock = new StubTimeProvider(ReferenceNow);
        await using var dbContext = CreateDbContext();
        var harness = CreateHarness(dbContext, clock);
        var (playerOne, playerTwo) = SeedPlayers(dbContext);
        var ruleset = await SeedRulesetsAsync(dbContext, harness);
        await dbContext.SaveChangesAsync();

        var thirdPlayer = await AddPlayerWithDeckAsync(dbContext, "Third", "third@example.com", nonLeaderCopies: 3);

        // A game bound to Pre-Release (three non-leader cards), hosted by the player whose deck fits it.
        var hostDeckResult = await harness.Read.ResolvePlayerDeckData(
            playerTwo.Id,
            await DeckIdForAsync(dbContext, playerTwo.Id),
            operationName: "Test");

        Assert.IsFalse(hostDeckResult.IsError);
        var boundGame = harness.Registry.Create([hostDeckResult.Value.Player], hostDeckResult.Value.CardDefinitions);
        boundGame.Ruleset = new GameRulesetBinding(
            ruleset.PreReleaseId,
            "pre-release",
            "Pre-Release",
            GameClockPolicy.Standard);

        var illegalJoin = await harness.InstanceService.JoinGameForUser(
            boundGame.Id,
            new JoinGameAsPlayer(playerOne.Id, await DeckIdForAsync(dbContext, playerOne.Id)));

        Assert.IsTrue(illegalJoin.IsError);
        Assert.AreEqual(GameRulesetDeckValidator.DeckIllegalCode, illegalJoin.FirstError.Code);

        var legalJoin = await harness.InstanceService.JoinGameForUser(
            boundGame.Id,
            new JoinGameAsPlayer(thirdPlayer.Id, await DeckIdForAsync(dbContext, thirdPlayer.Id)));

        Assert.IsFalse(legalJoin.IsError, legalJoin.IsError ? legalJoin.FirstError.Description : string.Empty);
        Assert.AreEqual(2, legalJoin.Value.State.Players.Count);
    }

    private static async Task<User> AddPlayerWithDeckAsync(
        ApplicationDbContext dbContext,
        string username,
        string email,
        int nonLeaderCopies)
    {
        var leader = await dbContext.CardCatalogEntries.SingleAsync(entry => entry.CardId == "L-001");
        var character = await dbContext.CardCatalogEntries.SingleAsync(entry => entry.CardId == "N-001");
        var now = DateTimeOffset.UtcNow;

        var player = new User
        {
            Username = username,
            Email = email,
            PasswordHash = "hash",
            IsGuest = false,
            CreatedAtUtc = now,
            LastSeenAtUtc = now,
        };

        dbContext.Users.Add(player);
        dbContext.Decks.Add(CreateDeck(player.Id, [(leader, 1), (character, nonLeaderCopies)]));
        await dbContext.SaveChangesAsync();

        return player;
    }

    private static async Task<Guid> DeckIdForAsync(ApplicationDbContext dbContext, Guid userId)
    {
        return await dbContext.Decks
            .Where(deck => deck.UserId == userId)
            .Select(deck => deck.Id)
            .SingleAsync();
    }

    private static (User Registered, User Guest) SeedPlayers(ApplicationDbContext dbContext)
    {
        var leader = CreateCatalogEntry("L-001", CardType.Leader);
        var characterOne = CreateCatalogEntry("N-001", CardType.Character);
        var characterTwo = CreateCatalogEntry("N-002", CardType.Character);
        dbContext.CardCatalogEntries.AddRange(leader, characterOne, characterTwo);

        var now = DateTimeOffset.UtcNow;
        var registered = new User
        {
            Username = "Registered",
            Email = "registered@example.com",
            PasswordHash = "hash",
            IsGuest = false,
            CreatedAtUtc = now,
            LastSeenAtUtc = now,
        };
        var guest = new User
        {
            Username = "Shadow",
            Email = "guest+quickmatch@guests.invalid",
            PasswordHash = "hash",
            IsGuest = true,
            CreatedAtUtc = now,
            LastSeenAtUtc = now,
        };
        dbContext.Users.AddRange(registered, guest);

        dbContext.Decks.AddRange(
            CreateDeck(registered.Id, [(leader, 1), (characterOne, 2)]),
            CreateDeck(guest.Id, [(leader, 1), (characterOne, 1), (characterTwo, 1)]));

        return (registered, guest);
    }

    private static async Task<(Guid StandardId, Guid PreReleaseId)> SeedRulesetsAsync(
        ApplicationDbContext dbContext,
        Harness harness)
    {
        var standard = await harness.Rulesets.CreateRuleset(new CreateDeckRulesetRequest(
            Key: "standard",
            Name: "Standard",
            IsActive: true,
            CardPoolMode: CardPoolMode.Open,
            LeaderCount: 1,
            NonLeaderCardCount: StandardDeckSize,
            MaxCopiesPerNonLeaderCard: 4,
            RequireLeaderColorMatch: false,
            AllowChakraCards: true,
            AllowSummonCards: true,
            SortOrder: 0,
            CardRestrictions: []));

        var preRelease = await harness.Rulesets.CreateRuleset(new CreateDeckRulesetRequest(
            Key: "pre-release",
            Name: "Pre-Release",
            IsActive: true,
            CardPoolMode: CardPoolMode.Open,
            LeaderCount: 1,
            NonLeaderCardCount: PreReleaseDeckSize,
            MaxCopiesPerNonLeaderCard: 3,
            RequireLeaderColorMatch: false,
            AllowChakraCards: true,
            AllowSummonCards: true,
            SortOrder: 1,
            CardRestrictions: []));

        Assert.IsFalse(standard.IsError, standard.IsError ? standard.FirstError.Description : string.Empty);
        Assert.IsFalse(preRelease.IsError, preRelease.IsError ? preRelease.FirstError.Description : string.Empty);

        return (standard.Value.Id, preRelease.Value.Id);
    }

    private static Deck CreateDeck(Guid userId, IReadOnlyList<(CardCatalogEntry Card, int Quantity)> cards)
    {
        return new Deck
        {
            Type = DeckType.User,
            Name = "deck",
            UserId = userId,
            Cards = cards
                .Select(card => new DeckCard
                {
                    CardCatalogEntry = card.Card,
                    Quantity = card.Quantity,
                })
                .ToList(),
        };
    }

    private static CardCatalogEntry CreateCatalogEntry(string cardId, CardType type)
    {
        return new CardCatalogEntry
        {
            CardId = cardId,
            DisplayName = cardId,
            Type = type,
            Color = CardColor.Red,
            Description = "desc",
            Life = type == CardType.Leader ? 5 : 0,
            NameJson = "[]",
            TraitsJson = "[]",
            ConditionsJson = "[]",
            EffectsJson = "[]",
            CreatedAtUtc = DateTimeOffset.UtcNow,
            UpdatedAtUtc = DateTimeOffset.UtcNow,
        };
    }

    private static Harness CreateHarness(ApplicationDbContext dbContext, TimeProvider timeProvider)
    {
        var registry = new InMemoryGameInstanceRegistry(
            new GameInstanceFactory(),
            new global::ProjectHiddenVillage.Server.Engine.GamePhaseService(
                new global::ProjectHiddenVillage.Server.Engine.GamePhaseStateService()));

        var effectHandlingService = new GameEffectHandlingService();
        var readService = new GamesReadService(
            registry,
            new CardMappingService(dbContext),
            dbContext,
            new GameRuntimeDeckService(effectHandlingService));

        var rulesets = new DeckRulesetService(dbContext);
        var deckValidator = new GameRulesetDeckValidator();
        var matchmaking = new MatchmakingService(
            registry,
            readService,
            rulesets,
            deckValidator,
            new MatchmakingQueue(),
            Options.Create(new MatchmakingOptions()),
            timeProvider);

        var instanceService = new GameInstanceService(registry, readService, rulesets, deckValidator);

        return new Harness(registry, rulesets, matchmaking, instanceService, readService);
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: $"matchmaking-tests-{Guid.NewGuid()}")
            .Options;

        return new ApplicationDbContext(options);
    }

    private sealed record Harness(
        InMemoryGameInstanceRegistry Registry,
        DeckRulesetService Rulesets,
        MatchmakingService Matchmaking,
        GameInstanceService InstanceService,
        GamesReadService Read);

    private sealed class StubTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public DateTimeOffset UtcNow { get; set; } = utcNow;

        public override DateTimeOffset GetUtcNow() => UtcNow;
    }
}
