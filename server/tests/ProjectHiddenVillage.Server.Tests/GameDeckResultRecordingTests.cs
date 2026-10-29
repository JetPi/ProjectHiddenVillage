using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Interfaces.Deck;
using ProjectHiddenVillage.Server.Api.Services.Games;
using ProjectHiddenVillage.Server.Engine;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// The registry is where a game ends, including the endings nobody asked for (the action clock running out), so it
/// is also where the result is handed to the recorder - once per game, and only for the seats that brought a stored
/// deck. Legacy compositions that build a <see cref="Player"/> from card ids alone keep working: they simply have no
/// deck to credit.
/// </summary>
[TestClass]
public sealed class GameDeckResultRecordingTests
{
    [TestMethod]
    public void Create_RemembersTheStoredDeckOfTheSeat()
    {
        var registry = CreateRegistry(new RecordingGameResultRecorder());
        var deckId = Guid.NewGuid();

        var game = registry.Create(
            players: [new Player { Id = "p1", Deck = BuildDeck(), DeckId = deckId }],
            cardDefinitions: BuildDefinitions("card-1"),
            random: new FixedIndexRandom(0));

        Assert.AreEqual(1, game.PlayerDeckIds.Count);
        Assert.AreEqual(deckId, game.PlayerDeckIds["p1"]);
    }

    [TestMethod]
    public void Join_RemembersTheStoredDeckOfTheSecondSeat()
    {
        var registry = CreateRegistry(new RecordingGameResultRecorder());
        var firstDeckId = Guid.NewGuid();
        var secondDeckId = Guid.NewGuid();

        var game = registry.Create(
            players: [new Player { Id = "p1", Deck = BuildDeck(), DeckId = firstDeckId }],
            cardDefinitions: BuildDefinitions("card-1"),
            random: new FixedIndexRandom(0));

        registry.Join(
            game.Id,
            new Player { Id = "p2", Deck = BuildDeck(), DeckId = secondDeckId },
            random: new FixedIndexRandom(0));

        Assert.AreEqual(firstDeckId, game.PlayerDeckIds["p1"]);
        Assert.AreEqual(secondDeckId, game.PlayerDeckIds["p2"]);
    }

    [TestMethod]
    public void Create_LeavesAPlayerWithoutAStoredDeckUncredited()
    {
        var registry = CreateRegistry(new RecordingGameResultRecorder());

        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = BuildDeck() },
                new Player { Id = "p2", Deck = BuildDeck() },
            ],
            cardDefinitions: BuildDefinitions("card-1"),
            random: new FixedIndexRandom(0));

        Assert.AreEqual(
            0,
            game.PlayerDeckIds.Count,
            "a seat built from bare card ids has no stored deck, so there is nothing to credit");
    }

    [TestMethod]
    public void ForfeitGame_HandsTheFinishedGameToTheRecorderOnce()
    {
        var recorder = new RecordingGameResultRecorder();
        var registry = CreateRegistry(recorder);
        var game = CreateTwoPlayerGame(registry);

        registry.ForfeitGame(game.Id, "p1");

        Assert.AreEqual(1, recorder.Instances.Count);
        Assert.AreSame(game, recorder.Instances[0]);
        Assert.IsTrue(game.IsResultRecorded);

        registry.ForfeitGame(game.Id, "p1");

        Assert.AreEqual(
            1,
            recorder.Instances.Count,
            "a second observation of the same finished game must not credit it again");
    }

    [TestMethod]
    public void RunningGame_IsNeverHandedToTheRecorder()
    {
        var recorder = new RecordingGameResultRecorder();
        var registry = CreateRegistry(recorder);

        var game = CreateTwoPlayerGame(registry);

        Assert.IsNull(game.State.Outcome);
        Assert.AreEqual(0, recorder.Instances.Count);
        Assert.IsFalse(game.IsResultRecorded);
    }

    private static InMemoryGameInstanceRegistry CreateRegistry(IGameResultRecorder recorder)
    {
        return new InMemoryGameInstanceRegistry(
            new GameInstanceFactory(),
            new GamePhaseService(new GamePhaseStateService()),
            phaseAutomation: new GamePhaseAutomationOptions { Enabled = true, PresentationAckTimeoutMs = 0 },
            resultRecorder: recorder);
    }

    private static GameInstance CreateTwoPlayerGame(InMemoryGameInstanceRegistry registry)
    {
        return registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = BuildDeck(), DeckId = Guid.NewGuid() },
                new Player { Id = "p2", Deck = BuildDeck(), DeckId = Guid.NewGuid() },
            ],
            cardDefinitions: BuildDefinitions("card-1"),
            random: new FixedIndexRandom(0));
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

    private sealed class RecordingGameResultRecorder : IGameResultRecorder
    {
        public List<GameInstance> Instances { get; } = [];

        public Task RecordAsync(GameInstance instance)
        {
            Instances.Add(instance);
            return Task.CompletedTask;
        }
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
