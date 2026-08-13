using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Engine;
using System.Text.RegularExpressions;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class InMemoryGameInstanceRegistryTests
{
    private readonly InMemoryGameInstanceRegistry registry = new(
        new GameInstanceFactory(),
        new global::ProjectHiddenVillage.Server.Engine.GamePhaseService(new global::ProjectHiddenVillage.Server.Engine.GamePhaseStateService()));

    [TestMethod]
    public void Create_StoresGame_AndTryGetReturnsIt()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1"] }
            ],
            cardDefinitions: BuildDefinitions("card-1"));

        var found = registry.TryGet(game.Id, out var loaded);

        Assert.IsTrue(found);
        Assert.IsNotNull(loaded);
        Assert.AreEqual(game.Id, loaded.Id);
        Assert.IsTrue(game.ActionLog.Any(entry => entry.ActionType == "game_created"));
    }

    [TestMethod]
    public void Join_AddsPlayer_AndEnqueuesStartingPlayerPrompt()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1"] }
            ],
            cardDefinitions: BuildDefinitions("card-1"));

        registry.Join(game.Id, new Player { Id = "p2", Deck = ["card-1"] }, new FixedIndexRandom(1));

        Assert.AreEqual(2, game.State.Players.Count);
        Assert.AreEqual("p2", game.State.ActivePlayerId);
        var prompt = game.GetPendingPrompt();
        Assert.IsNotNull(prompt);
        Assert.AreEqual("p2", prompt.RequestedPlayerId);
        CollectionAssert.AreEqual(new[] { "goFirst", "goSecond" }, prompt.Options);
        Assert.IsTrue(game.ActionLog.Any(entry => entry.ActionType == "player_joined" && entry.PlayerId == "p2"));
        Assert.IsTrue(game.ActionLog.Any(entry => entry.ActionType == "starting_player_assigned" && entry.PlayerId == "p2"));
        Assert.IsTrue(game.ActionLog.Any(entry => entry.ActionType == "starting_player_prompted" && entry.PlayerId == "p2"));
    }

    [TestMethod]
    public void ResolvePrompt_SetsActivePlayer()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1"] },
                new Player { Id = "p2", Deck = ["card-1"] }
            ],
            cardDefinitions: BuildDefinitions("card-1"),
            random: new FixedIndexRandom(0));

        var prompt = game.GetPendingPrompt()!;

        registry.ResolvePrompt(game.Id, prompt.RequestedPlayerId, "goSecond");

        Assert.AreEqual("p2", game.State.ActivePlayerId);
        Assert.AreEqual(GamePhase.DrawInitialHand, game.State.Phase);
        Assert.IsNull(game.GetPendingPrompt());
        Assert.IsTrue(game.ActionLog.Any(entry => entry.ActionType == "prompt_resolved" && entry.PlayerId == prompt.RequestedPlayerId));
        Assert.IsTrue(game.ActionLog.Any(entry => entry.ActionType == "phase_started" && entry.PlayerId == "p2"));
    }

    [TestMethod]
    public void AdvancePhase_Throws_WhenPromptIsPending()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1"] },
                new Player { Id = "p2", Deck = ["card-1"] }
            ],
            cardDefinitions: BuildDefinitions("card-1"),
            random: new FixedIndexRandom(0));

        Assert.IsNotNull(game.GetPendingPrompt());

        var ex = Assert.ThrowsException<InvalidOperationException>(() => registry.AdvancePhase(game.Id));
        Assert.AreEqual("Cannot advance phase while a prompt is pending.", ex.Message);
    }

    [TestMethod]
    public void ResolvePrompt_Mulligan_AdvancesToStartOfMainPhase()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1", "card-1", "card-1", "card-1", "card-1", "card-1"] },
                new Player { Id = "p2", Deck = ["card-1", "card-1", "card-1", "card-1", "card-1", "card-1"] }
            ],
            cardDefinitions: BuildDefinitions("card-1"),
            random: new FixedIndexRandom(0));

        var startingPrompt = game.GetPendingPrompt()!;
        registry.ResolvePrompt(game.Id, startingPrompt.RequestedPlayerId, "goFirst");

        // Enter Mulligan and enqueue mulligan prompt for the second player.
        registry.AdvancePhase(game.Id);

        var mulliganPrompt = game.GetPendingPrompt();
        Assert.IsNotNull(mulliganPrompt);
        Assert.AreEqual(GamePromptType.Mulligan, mulliganPrompt.Type);

        registry.ResolvePrompt(game.Id, mulliganPrompt.RequestedPlayerId, "noMulligan");

        Assert.AreEqual(GamePhase.StartOfMainPhase, game.State.Phase);
        Assert.IsNull(game.GetPendingPrompt());
    }

    [TestMethod]
    public void Join_Throws_WhenGameIsMissing()
    {
        var ex = Assert.ThrowsException<KeyNotFoundException>(() =>
            registry.Join("missing", new Player { Id = "p2", Deck = ["card-1"] }));

        Assert.AreEqual("Game instance 'missing' was not found.", ex.Message);
    }

    [TestMethod]
    public void Create_InitializesAndPreservesSummonCardFlags()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1"] },
                new Player { Id = "p2", Deck = ["card-1"] }
            ],
            cardDefinitions: BuildDefinitions("card-1"),
            random: new FixedIndexRandom(0));

        Assert.IsTrue(game.State.Player1SummonCard);
        Assert.IsTrue(game.State.Player2SummonCard);

        var found = registry.TryGet(game.Id, out var loaded);

        Assert.IsTrue(found);
        Assert.IsNotNull(loaded);
        Assert.IsTrue(loaded.State.Player1SummonCard);
        Assert.IsTrue(loaded.State.Player2SummonCard);
    }

    [TestMethod]
    public void Create_AssignsFiveCharacterAlphanumericGameCode()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1"] }
            ],
            cardDefinitions: BuildDefinitions("card-1"));

        Assert.AreEqual(5, game.Id.Length);
        Assert.IsTrue(Regex.IsMatch(game.Id, "^[A-Za-z0-9]{5}$"));
    }

    [TestMethod]
    public void Create_UsesPreferredGameCode_WhenValidAndAvailable()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1"] }
            ],
            cardDefinitions: BuildDefinitions("card-1"),
            preferredGameCode: "TEST1");

        Assert.AreEqual("TEST1", game.Id);
    }

    [TestMethod]
    public void Create_Throws_WhenPreferredGameCodeIsAlreadyInUse()
    {
        registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1"] }
            ],
            cardDefinitions: BuildDefinitions("card-1"),
            preferredGameCode: "TEST1");

        var ex = Assert.ThrowsException<InvalidOperationException>(() =>
            registry.Create(
                players:
                [
                    new Player { Id = "p2", Deck = ["card-1"] }
                ],
                cardDefinitions: BuildDefinitions("card-1"),
                preferredGameCode: "TEST1"));

        Assert.AreEqual("Game code 'TEST1' is already in use.", ex.Message);
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