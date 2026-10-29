using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.Deck;
using ProjectHiddenVillage.Server.Data;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// Crediting a finished game to the decks that played it: one win for the winner, one loss for the losers, one draw
/// each when no winner was resolved, and nothing at all for a guest, a missing deck, or a player who sat down without
/// a stored deck. The counters accumulate, because a deck's record is the sum of every game it played.
/// </summary>
[TestClass]
public sealed class GameResultRecorderTests
{
    [TestMethod]
    public async Task RecordAsync_CreditsTheWinnerAndTheLoser()
    {
        await using var dbContext = CreateDbContext();
        var first = SeedPlayerWithDeck(dbContext, "first");
        var second = SeedPlayerWithDeck(dbContext, "second");
        await dbContext.SaveChangesAsync();

        var game = CreateGame(first, second, new GameOutcome
        {
            WinnerPlayerId = first.PlayerId,
            LoserPlayerIds = [second.PlayerId],
            Reason = GameEndReason.LeaderLifeDepleted,
            TurnNumber = 4,
        });

        await CreateRecorder(dbContext).RecordAsync(game);

        var winnerRecord = await FindRecordAsync(dbContext, first.DeckId, first.UserId);
        var loserRecord = await FindRecordAsync(dbContext, second.DeckId, second.UserId);

        Assert.IsNotNull(winnerRecord);
        Assert.AreEqual(1, winnerRecord.Wins);
        Assert.AreEqual(0, winnerRecord.Losses);
        Assert.AreEqual(0, winnerRecord.Draws);

        Assert.IsNotNull(loserRecord);
        Assert.AreEqual(0, loserRecord.Wins);
        Assert.AreEqual(1, loserRecord.Losses);
        Assert.AreEqual(0, loserRecord.Draws);
    }

    [TestMethod]
    public async Task RecordAsync_AddsToTheRecordTheDeckAlreadyHas()
    {
        await using var dbContext = CreateDbContext();
        var first = SeedPlayerWithDeck(dbContext, "first");
        var second = SeedPlayerWithDeck(dbContext, "second");
        dbContext.DeckRecords.Add(new DeckRecord
        {
            DeckId = first.DeckId,
            UserId = first.UserId,
            Wins = 3,
            Losses = 2,
            Draws = 1,
        });
        await dbContext.SaveChangesAsync();

        var game = CreateGame(first, second, new GameOutcome
        {
            WinnerPlayerId = first.PlayerId,
            LoserPlayerIds = [second.PlayerId],
            Reason = GameEndReason.DeckOut,
            TurnNumber = 7,
        });

        await CreateRecorder(dbContext).RecordAsync(game);

        var record = await FindRecordAsync(dbContext, first.DeckId, first.UserId);
        Assert.IsNotNull(record);
        Assert.AreEqual(4, record.Wins, "the record accumulates across games");
        Assert.AreEqual(2, record.Losses);
        Assert.AreEqual(1, record.Draws);
    }

    [TestMethod]
    public async Task RecordAsync_WithNoWinner_IsADrawForBothPlayers()
    {
        await using var dbContext = CreateDbContext();
        var first = SeedPlayerWithDeck(dbContext, "first");
        var second = SeedPlayerWithDeck(dbContext, "second");
        await dbContext.SaveChangesAsync();

        var game = CreateGame(first, second, new GameOutcome
        {
            WinnerPlayerId = null,
            LoserPlayerIds = [first.PlayerId, second.PlayerId],
            Reason = GameEndReason.LeaderLifeDepleted,
            TurnNumber = 9,
        });

        await CreateRecorder(dbContext).RecordAsync(game);

        var firstRecord = await FindRecordAsync(dbContext, first.DeckId, first.UserId);
        var secondRecord = await FindRecordAsync(dbContext, second.DeckId, second.UserId);

        Assert.IsNotNull(firstRecord);
        Assert.AreEqual(0, firstRecord.Wins);
        Assert.AreEqual(0, firstRecord.Losses, "a draw is not a defeat");
        Assert.AreEqual(1, firstRecord.Draws);

        Assert.IsNotNull(secondRecord);
        Assert.AreEqual(0, secondRecord.Losses);
        Assert.AreEqual(1, secondRecord.Draws);
    }

    [TestMethod]
    public async Task RecordAsync_SkipsAGuestPlayer()
    {
        await using var dbContext = CreateDbContext();
        var guest = SeedPlayerWithDeck(dbContext, "guest", isGuest: true);
        var opponent = SeedPlayerWithDeck(dbContext, "opponent");
        await dbContext.SaveChangesAsync();

        var game = CreateGame(opponent, guest, new GameOutcome
        {
            WinnerPlayerId = opponent.PlayerId,
            LoserPlayerIds = [guest.PlayerId],
            Reason = GameEndReason.Resigned,
            TurnNumber = 2,
        });

        await CreateRecorder(dbContext).RecordAsync(game);

        Assert.IsNull(
            await FindRecordAsync(dbContext, guest.DeckId, guest.UserId),
            "a guest owns nothing durable, so their record is never kept");
        Assert.IsNotNull(await FindRecordAsync(dbContext, opponent.DeckId, opponent.UserId));
    }

    [TestMethod]
    public async Task RecordAsync_DoesNothing_WhileTheGameHasNoOutcome()
    {
        await using var dbContext = CreateDbContext();
        var first = SeedPlayerWithDeck(dbContext, "first");
        var second = SeedPlayerWithDeck(dbContext, "second");
        await dbContext.SaveChangesAsync();

        await CreateRecorder(dbContext).RecordAsync(CreateGame(first, second, outcome: null));

        Assert.AreEqual(0, await dbContext.DeckRecords.CountAsync());
    }

    [TestMethod]
    public async Task RecordAsync_SkipsAPlayerWhoSatDownWithoutAStoredDeck()
    {
        await using var dbContext = CreateDbContext();
        var seated = SeedPlayerWithDeck(dbContext, "seated");
        await dbContext.SaveChangesAsync();

        var noDeckPlayer = new Player
        {
            Id = Guid.NewGuid().ToString("N"),
            Deck = BuildDeck(),
            DeckId = null,
        };

        var players = new List<Player> { BuildPlayer(seated), noDeckPlayer };
        var game = new GameInstanceFactory().Create(
            players: players,
            cardDefinitions: BuildDefinitions("card-1"),
            random: new FixedIndexRandom(0));
        game.CapturePlayerDecks(players);
        game.State.Outcome = new GameOutcome
        {
            WinnerPlayerId = noDeckPlayer.Id,
            LoserPlayerIds = [seated.PlayerId],
            Reason = GameEndReason.LeaderLifeDepleted,
            TurnNumber = 5,
        };

        await CreateRecorder(dbContext).RecordAsync(game);

        Assert.AreEqual(
            1,
            await dbContext.DeckRecords.CountAsync(),
            "only the seat that brought a stored deck is credited");
        Assert.IsNotNull(await FindRecordAsync(dbContext, seated.DeckId, seated.UserId));
    }

    private static GameResultRecorder CreateRecorder(ApplicationDbContext dbContext)
    {
        var services = new ServiceCollection();
        services.AddSingleton(dbContext);
        var provider = services.BuildServiceProvider();

        return new GameResultRecorder(
            provider.GetRequiredService<IServiceScopeFactory>(),
            TimeProvider.System,
            NullLogger<GameResultRecorder>.Instance);
    }

    private static GameInstance CreateGame(
        SeededPlayer first,
        SeededPlayer second,
        GameOutcome? outcome)
    {
        var players = new List<Player> { BuildPlayer(first), BuildPlayer(second) };
        var game = new GameInstanceFactory().Create(
            players: players,
            cardDefinitions: BuildDefinitions("card-1"),
            random: new FixedIndexRandom(0));

        game.CapturePlayerDecks(players);
        game.State.Outcome = outcome;

        return game;
    }

    private static Player BuildPlayer(SeededPlayer player)
    {
        return new Player
        {
            Id = player.PlayerId,
            Deck = BuildDeck(),
            DeckId = player.DeckId,
        };
    }

    private static SeededPlayer SeedPlayerWithDeck(
        ApplicationDbContext dbContext,
        string name,
        bool isGuest = false)
    {
        var user = new User
        {
            Email = $"{name}-{Guid.NewGuid():N}@hiddenvillage.local",
            Username = name,
            PasswordHash = "not-a-real-hash",
            IsGuest = isGuest,
        };

        var deck = new Deck
        {
            Type = DeckType.User,
            Name = $"{name} deck",
            UserId = user.Id,
            User = user,
        };

        dbContext.Users.Add(user);
        dbContext.Decks.Add(deck);

        return new SeededPlayer(user.Id, deck.Id);
    }

    private static Task<DeckRecord?> FindRecordAsync(
        ApplicationDbContext dbContext,
        Guid deckId,
        Guid userId)
    {
        return dbContext.DeckRecords
            .SingleOrDefaultAsync(record => record.DeckId == deckId && record.UserId == userId);
    }

    private static List<string> BuildDeck()
    {
        return Enumerable.Repeat("card-1", 12).ToList();
    }

    private static Dictionary<string, Card> BuildDefinitions(params string[] ids)
    {
        return ids.ToDictionary(
            keySelector: id => id,
            elementSelector: id => new Card
            {
                Id = id,
                DisplayName = id,
                Name = [id],
                Type = CardType.Character,
                Traits = [],
                Color = CardColor.Red,
                Description = string.Empty,
                Conditions = [],
                Effects = []
            },
            comparer: StringComparer.Ordinal);
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: $"game-result-recorder-tests-{Guid.NewGuid()}")
            .Options;

        return new ApplicationDbContext(options);
    }

    private sealed record SeededPlayer(Guid UserId, Guid DeckId)
    {
        public string PlayerId => UserId.ToString("N");
    }

    private sealed class FixedIndexRandom(int fixedIndex) : Random
    {
        public override int Next(int maxValue)
        {
            if (maxValue <= 0)
            {
                throw new ArgumentOutOfRangeException(nameof(maxValue), "maxValue must be positive.");
            }

            return fixedIndex % maxValue;
        }
    }
}
