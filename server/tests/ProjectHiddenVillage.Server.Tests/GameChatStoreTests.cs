using System.Collections.Concurrent;
using Microsoft.Extensions.Options;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.Chat;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class GameChatStoreTests
{
    private static readonly DateTimeOffset StartUtc = new(2026, 10, 28, 12, 0, 0, TimeSpan.Zero);

    private static GameChatStore CreateStore(
        TestClockProvider clock,
        Action<GameChatOptions>? configure = null)
    {
        var options = new GameChatOptions
        {
            SendBudgetPerMinute = 600,
            MaxMessagesPerGame = 200,
            MaxTextLength = 500,
            RoomIdleMinutes = 120,
            MaxRooms = 2000,
            SweepIntervalMinutes = 5,
        };

        configure?.Invoke(options);

        return new GameChatStore(Options.Create(options), clock);
    }

    [TestMethod]
    public void Append_AssignsMonotonicSequencesUnderConcurrentSenders()
    {
        var clock = new TestClockProvider(StartUtc);
        var store = CreateStore(clock);
        var sequences = new ConcurrentBag<long>();

        Parallel.For(0, 64, index =>
        {
            var result = store.Append("Game-1", $"player-{index % 2}", $"message {index}");
            if (result.IsError)
            {
                throw new InvalidOperationException(result.FirstError.Code);
            }

            sequences.Add(result.Value.Sequence);
        });

        var ordered = sequences.OrderBy(sequence => sequence).ToArray();

        Assert.AreEqual(64, ordered.Length);
        CollectionAssert.AreEqual(Enumerable.Range(1, 64).Select(value => (long)value).ToArray(), ordered);
        Assert.AreEqual(64, store.ReadHistory("game-1", 0).LatestSequence);
    }

    [TestMethod]
    public void Append_KeepsOnlyTheRetainedTail()
    {
        var clock = new TestClockProvider(StartUtc);
        var store = CreateStore(clock, options => options.MaxMessagesPerGame = 3);

        for (var index = 1; index <= 5; index += 1)
        {
            store.Append("game-1", "player-a", $"message {index}");
        }

        var history = store.ReadHistory("game-1", 0);

        CollectionAssert.AreEqual(
            new long[] { 3, 4, 5 },
            history.Messages.Select(message => message.Sequence).ToArray());
        Assert.AreEqual(5, history.LatestSequence);
    }

    [TestMethod]
    public void ReadHistory_ReturnsOnlyWhatTheClientHasNotSeen()
    {
        var clock = new TestClockProvider(StartUtc);
        var store = CreateStore(clock);

        store.Append("game-1", "player-a", "first");
        store.Append("game-1", "player-b", "second");

        var catchUp = store.ReadHistory("game-1", 1);

        Assert.AreEqual(1, catchUp.Messages.Count);
        Assert.AreEqual("second", catchUp.Messages[0].Text);
        Assert.AreEqual(2, catchUp.LatestSequence);
    }

    [TestMethod]
    public void ReadHistory_OfAnUnknownGameIsEmpty()
    {
        var clock = new TestClockProvider(StartUtc);
        var store = CreateStore(clock);

        var history = store.ReadHistory("game-missing", 0);

        Assert.AreEqual(0, history.Messages.Count);
        Assert.AreEqual(0, history.LatestSequence);
    }

    [TestMethod]
    public void Append_TrimsTheTextAndReportsTheServerSideAuthor()
    {
        var clock = new TestClockProvider(StartUtc);
        var store = CreateStore(clock);

        var result = store.Append("game-1", "player-a", "  hello  ");

        Assert.IsFalse(result.IsError);
        Assert.AreEqual("hello", result.Value.Text);
        Assert.AreEqual("player-a", result.Value.SenderPlayerId);
        Assert.AreEqual(StartUtc, result.Value.SentAtUtc);
        Assert.IsFalse(string.IsNullOrWhiteSpace(result.Value.MessageId));
    }

    [TestMethod]
    public void Append_RefusesEmptyAndOverlongText()
    {
        var clock = new TestClockProvider(StartUtc);
        var store = CreateStore(clock, options => options.MaxTextLength = 10);

        var empty = store.Append("game-1", "player-a", "   ");
        var tooLong = store.Append("game-1", "player-a", new string('x', 11));

        Assert.AreEqual("Game.Chat.Empty", empty.FirstError.Code);
        Assert.AreEqual("Game.Chat.TooLong", tooLong.FirstError.Code);
        Assert.AreEqual(0, store.ReadHistory("game-1", 0).Messages.Count);
    }

    [TestMethod]
    public void Append_RefusesADisabledServer()
    {
        var clock = new TestClockProvider(StartUtc);
        var store = CreateStore(clock, options => options.Enabled = false);

        var result = store.Append("game-1", "player-a", "hello");

        Assert.AreEqual("Game.Chat.Disabled", result.FirstError.Code);
    }

    [TestMethod]
    public void Append_ChargesTheSenderBudgetWithoutBlockingTheOpponent()
    {
        var clock = new TestClockProvider(StartUtc);
        var store = CreateStore(clock, options => options.SendBudgetPerMinute = 2);

        Assert.IsFalse(store.Append("game-1", "player-a", "one").IsError);
        Assert.IsFalse(store.Append("game-1", "player-a", "two").IsError);

        var refused = store.Append("game-1", "player-a", "three");

        Assert.AreEqual("Game.Chat.RateLimited", refused.FirstError.Code);
        Assert.IsFalse(store.Append("game-1", "player-b", "one").IsError);

        clock.Advance(TimeSpan.FromMinutes(1));

        Assert.IsFalse(store.Append("game-1", "player-a", "four").IsError);
    }

    [TestMethod]
    public void Sweep_DropsARoomThatWentQuiet()
    {
        var clock = new TestClockProvider(StartUtc);
        var store = CreateStore(clock, options =>
        {
            options.SweepIntervalMinutes = 1;
            options.RoomIdleMinutes = 1;
        });

        store.Append("game-1", "player-a", "hello");

        clock.Advance(TimeSpan.FromMinutes(3));
        store.Append("game-2", "player-a", "hello");

        Assert.AreEqual(0, store.ReadHistory("game-1", 0).Messages.Count);
        Assert.AreEqual(1, store.ReadHistory("game-2", 0).Messages.Count);
    }

    [TestMethod]
    public void Sweep_DropsTheQuietestRoomsWhenTheCapIsExceeded()
    {
        var clock = new TestClockProvider(StartUtc);
        var store = CreateStore(clock, options =>
        {
            options.SweepIntervalMinutes = 1;
            options.RoomIdleMinutes = 600;
            options.MaxRooms = 1;
        });

        store.Append("game-1", "player-a", "hello");

        clock.Advance(TimeSpan.FromMinutes(1));
        store.Append("game-2", "player-a", "hello");

        clock.Advance(TimeSpan.FromMinutes(1));
        store.Append("game-3", "player-a", "hello");

        Assert.AreEqual(0, store.ReadHistory("game-1", 0).Messages.Count);
        Assert.AreEqual(1, store.ReadHistory("game-2", 0).Messages.Count);
        Assert.AreEqual(1, store.ReadHistory("game-3", 0).Messages.Count);
    }
}
