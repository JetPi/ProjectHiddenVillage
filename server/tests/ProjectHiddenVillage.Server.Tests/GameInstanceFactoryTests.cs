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
    public void JoinPlayer_WhenSecondPlayerJoins_EnqueuesStartingPlayerPrompt()
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

        Assert.AreEqual("p2", game.State.ActivePlayerId);
        var prompt = game.GetPendingPrompt();
        Assert.IsNotNull(prompt);
        Assert.AreEqual(GamePromptType.ChooseStartingPlayer, prompt.Type);
        CollectionAssert.AreEqual(new[] { "goFirst", "goSecond" }, prompt.Options);
        Assert.IsTrue(game.ActionLog.Any(entry => entry.ActionType == "starting_player_assigned"));
        Assert.IsTrue(game.ActionLog.Any(entry => entry.ActionType == "starting_player_prompted"));
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
        Assert.AreEqual("p3", prompt.RequestedPlayerId);
        CollectionAssert.AreEqual(new[] { "goFirst", "goSecond" }, prompt.Options);
        Assert.AreEqual("p3", game.State.ActivePlayerId);
        Assert.AreEqual(GamePhase.ChooseStartingPlayer, game.State.Phase);
        Assert.AreEqual(string.Empty, game.State.PriorityPlayerId);
        Assert.IsTrue(game.ActionLog.Any(entry => entry.ActionType == "starting_player_assigned"));
        Assert.IsTrue(game.ActionLog.Any(entry => entry.ActionType == "starting_player_prompted"));
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
        var prompt = game.GetPendingPrompt()!;

        game.ResolvePrompt(prompt.RequestedPlayerId, "goSecond");

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

        var ex = Assert.ThrowsException<InvalidOperationException>(() => game.ResolvePrompt("p2", "goFirst"));
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
        var prompt = game.GetPendingPrompt()!;

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

    [TestMethod]
    public void Create_UsesDeterministicPerPlayerDeckSeeds()
    {
        var players = new List<Player>
        {
            new() { Id = "p1", Deck = ["card-1", "card-2", "card-3", "card-4", "card-5", "card-6"] },
            new() { Id = "p2", Deck = ["card-1", "card-2", "card-3", "card-4", "card-5", "card-6"] }
        };

        var cardDefinitions = BuildDefinitions("card-1", "card-2", "card-3", "card-4", "card-5", "card-6");

        var game = factory.Create(players, cardDefinitions, new FixedIndexRandom(0));

        var p1 = game.State.Players.Single(player => player.PlayerId == "p1");
        var p2 = game.State.Players.Single(player => player.PlayerId == "p2");

        Assert.AreNotEqual(0, game.State.GameSeed);
        Assert.AreNotEqual(0, p1.DeckShuffleSeed);
        Assert.AreNotEqual(0, p2.DeckShuffleSeed);
        Assert.AreEqual(1, p1.DeckShuffleCount);
        Assert.AreEqual(1, p2.DeckShuffleCount);
        Assert.AreNotEqual(p1.DeckShuffleSeed, p2.DeckShuffleSeed);
    }

    [TestMethod]
    public void Create_BuildsLeaderCardInstance_WithRuntimeLeaderData()
    {
        var players = new List<Player>
        {
            new() { Id = "p1", Deck = ["leader-1", "card-1"] },
            new() { Id = "p2", Deck = ["card-1"] }
        };

        var cardDefinitions = new Dictionary<string, Card>(StringComparer.Ordinal)
        {
            ["leader-1"] = new LeaderCard
            {
                Id = "leader-1",
                DisplayName = "Naruto Uzumaki",
                Name = ["Naruto Uzumaki"],
                Type = CardType.Leader,
                Color = CardColor.Red,
                Description = "[Recovery] Draw 1 card.",
                Traits = ["Leaf", "Ninja"],
                Damage = 2,
                Power = 7,
                Life = 6,
                RecoveryEffect = "Draw 1 card."
            },
            ["card-1"] = new Card
            {
                Id = "card-1",
                DisplayName = "Support Shinobi",
                Name = ["Support Shinobi"],
                Type = CardType.Character,
                Color = CardColor.Red,
                Description = string.Empty,
                Traits = [],
                Damage = 0,
                Power = 1,
                Conditions = [],
                Effects = []
            }
        };

        var game = factory.Create(players, cardDefinitions, new FixedIndexRandom(0));
        var p1 = game.State.Players.Single(player => player.PlayerId == "p1");

        Assert.IsNotNull(p1.LeaderCardInstance);
        Assert.AreEqual("leader-1", p1.LeaderCardInstance.CardDefinitionId);
        Assert.AreEqual("Naruto Uzumaki", p1.LeaderCardInstance.Name);
        Assert.AreEqual(CardColor.Red, p1.LeaderCardInstance.Color);
        Assert.AreEqual("[Recovery] Draw 1 card.", p1.LeaderCardInstance.Description);
        CollectionAssert.AreEqual(new[] { "Leaf", "Ninja" }, p1.LeaderCardInstance.Traits);
        Assert.AreEqual(2, p1.LeaderCardInstance.Damage);
        Assert.AreEqual(7, p1.LeaderCardInstance.Power);
        Assert.AreEqual("Draw 1 card.", p1.LeaderCardInstance.RecoveryEffect);
        Assert.AreEqual(6, p1.LeaderCardInstance.TotalLife);
        Assert.AreEqual(6, p1.LeaderCardInstance.CurrentLife);
        Assert.AreEqual("p1", p1.LeaderCardInstance.OwnerPlayerId);
        Assert.AreEqual("p1", p1.LeaderCardInstance.ControllerPlayerId);
    }

    [TestMethod]
    public void Create_InitializesSummonCardFlags_ToTrueForBothPlayers()
    {
        var players = new List<Player>
        {
            new() { Id = "p1", Deck = ["card-1"] },
            new() { Id = "p2", Deck = ["card-1"] }
        };

        var cardDefinitions = BuildDefinitions("card-1");

        var game = factory.Create(players, cardDefinitions, new FixedIndexRandom(0));

        Assert.IsTrue(game.State.Player1SummonCard);
        Assert.IsTrue(game.State.Player2SummonCard);
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