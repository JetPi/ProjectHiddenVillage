using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class GameInstanceFactoryTests
{
    private readonly GameInstanceFactory factory = new();

    [TestMethod]
    public void Create_WithOnePlayer_CreatesLobbyWithoutStartingPrompt()
    {
        var players = new List<Player>
        {
            new() { Id = "p1", Deck = ["card-1"] }
        };

        var cardDefinitions = BuildDefinitions("card-1");
        var game = factory.Create(players, cardDefinitions);

        Assert.AreEqual(1, game.State.Players.Count);
        Assert.AreEqual(string.Empty, game.State.ActivePlayerId);
        Assert.IsNull(game.GetPendingPrompt());
        Assert.IsTrue(game.ActionLog.Any(entry => entry.ActionType == "game_created"));
    }

    [TestMethod]
    public void JoinPlayer_WhenSecondPlayerJoins_EnqueuesStartingPrompt()
    {
        var game = factory.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1"] }
            ],
            cardDefinitions: BuildDefinitions("card-1"));

        factory.JoinPlayer(
            instance: game,
            player: new Player { Id = "p2", Deck = ["card-1"] },
            random: new FixedIndexRandom(1));

        var prompt = game.GetPendingPrompt();

        Assert.IsNotNull(prompt);
        Assert.AreEqual(GamePromptType.ChooseStartingPlayer, prompt.Type);
        Assert.AreEqual("p2", prompt.RequestedPlayerId);
        CollectionAssert.AreEquivalent(new[] { "p1", "p2" }, prompt.Options);
        Assert.AreEqual(string.Empty, game.State.ActivePlayerId);
        Assert.IsTrue(game.ActionLog.Any(entry => entry.ActionType == "prompt_created"));
    }

    [TestMethod]
    public void Create_Throws_WhenPlayerIdsAreDuplicated()
    {
        var players = new List<Player>
        {
            new() { Id = "p1", Deck = ["card-1"] },
            new() { Id = "p1", Deck = ["card-1"] }
        };

        var cardDefinitions = BuildDefinitions("card-1");

        var ex = Assert.ThrowsException<InvalidOperationException>(() =>
            factory.Create(players, cardDefinitions));

        Assert.AreEqual("Duplicate player id 'p1' found while creating game.", ex.Message);
    }

    [TestMethod]
    public void Create_Throws_WhenDeckHasUnknownCardDefinition()
    {
        var players = new List<Player>
        {
            new() { Id = "p1", Deck = ["card-1"] },
            new() { Id = "p2", Deck = ["missing"] }
        };

        var cardDefinitions = BuildDefinitions("card-1");

        var ex = Assert.ThrowsException<InvalidOperationException>(() =>
            factory.Create(players, cardDefinitions));

        Assert.AreEqual("Card definition 'missing' in player 'p2' deck was not found.", ex.Message);
    }

    [TestMethod]
    public void Create_EnqueuesStartingPlayerPrompt_ForRandomChooser()
    {
        var players = new List<Player>
        {
            new() { Id = "p1", Deck = ["card-1"] },
            new() { Id = "p2", Deck = ["card-1"] },
            new() { Id = "p3", Deck = ["card-1"] }
        };

        var cardDefinitions = BuildDefinitions("card-1");
        var stubRandom = new FixedIndexRandom(fixedIndex: 2);

        var game = factory.Create(players, cardDefinitions, stubRandom);
        var prompt = game.GetPendingPrompt();

        Assert.IsNotNull(prompt);
        Assert.AreEqual(GamePromptType.ChooseStartingPlayer, prompt.Type);
        Assert.AreEqual("p3", prompt.RequestedPlayerId);
        CollectionAssert.AreEquivalent(new[] { "p1", "p2", "p3" }, prompt.Options);
        Assert.AreEqual(string.Empty, game.State.ActivePlayerId);
        Assert.AreEqual(GamePhase.StartOfMainPhase, game.State.Phase);
        Assert.AreEqual(string.Empty, game.State.PriorityPlayerId);
    }

    [TestMethod]
    public void ResolvePrompt_SetsActivePlayer_WhenRequestedPlayerSelectsValidOption()
    {
        var players = new List<Player>
        {
            new() { Id = "p1", Deck = ["card-1"] },
            new() { Id = "p2", Deck = ["card-1"] },
            new() { Id = "p3", Deck = ["card-1"] }
        };

        var game = factory.Create(players, BuildDefinitions("card-1"), new FixedIndexRandom(0));
        var prompt = game.GetPendingPrompt();

        Assert.IsNotNull(prompt);
        game.ResolvePrompt(prompt.RequestedPlayerId, "p2");

        Assert.AreEqual("p2", game.State.ActivePlayerId);
        Assert.IsNull(game.GetPendingPrompt());
    }

    [TestMethod]
    public void ResolvePrompt_Throws_WhenNonRequestedPlayerAttemptsToAnswer()
    {
        var players = new List<Player>
        {
            new() { Id = "p1", Deck = ["card-1"] },
            new() { Id = "p2", Deck = ["card-1"] }
        };

        var game = factory.Create(players, BuildDefinitions("card-1"), new FixedIndexRandom(0));

        var ex = Assert.ThrowsException<InvalidOperationException>(() => game.ResolvePrompt("p2", "p1"));
        Assert.AreEqual("Only the requested player can resolve this prompt.", ex.Message);
    }

    [TestMethod]
    public void ResolvePrompt_Throws_WhenOptionIsInvalid()
    {
        var players = new List<Player>
        {
            new() { Id = "p1", Deck = ["card-1"] },
            new() { Id = "p2", Deck = ["card-1"] }
        };

        var game = factory.Create(players, BuildDefinitions("card-1"), new FixedIndexRandom(0));
        var prompt = game.GetPendingPrompt();

        Assert.IsNotNull(prompt);
        var ex = Assert.ThrowsException<InvalidOperationException>(() =>
            game.ResolvePrompt(prompt.RequestedPlayerId, "unknown"));

        Assert.AreEqual("Selected option is not valid for this prompt.", ex.Message);
    }

    [TestMethod]
    public void Create_BuildsDeckInstances_WithOwnerAndController()
    {
        var players = new List<Player>
        {
            new() { Id = "p1", Deck = ["card-1", "card-2"] },
            new() { Id = "p2", Deck = ["card-2"] }
        };

        var cardDefinitions = BuildDefinitions("card-1", "card-2");

        var game = factory.Create(players, cardDefinitions, new FixedIndexRandom(0));
        var p1 = game.State.Players.Single(player => player.PlayerId == "p1");

        Assert.AreEqual(2, p1.Deck.Count);
        Assert.IsTrue(p1.Deck.All(card => card.OwnerPlayerId == "p1"));
        Assert.IsTrue(p1.Deck.All(card => card.ControllerPlayerId == "p1"));
        Assert.IsTrue(p1.Deck.All(card => !string.IsNullOrWhiteSpace(card.InstanceId)));
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
                Type = ["unit"],
                Traits = [],
                Color = "neutral",
                Description = string.Empty,
                Conditions = [],
                Effects = []
            },
            comparer: StringComparer.Ordinal);
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