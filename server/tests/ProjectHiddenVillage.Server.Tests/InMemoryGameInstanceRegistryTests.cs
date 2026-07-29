using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Engine;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class InMemoryGameInstanceRegistryTests
{
    private readonly InMemoryGameInstanceRegistry registry = new(
        new GameInstanceFactory(),
        new global::ProjectHiddenVillage.Server.Engine.GamePhaseService());

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
    public void Join_AddsPlayer_AndCanCreateStartingPrompt()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1"] }
            ],
            cardDefinitions: BuildDefinitions("card-1"));

        registry.Join(game.Id, new Player { Id = "p2", Deck = ["card-1"] }, new FixedIndexRandom(1));

        Assert.AreEqual(2, game.State.Players.Count);
        var prompt = game.GetPendingPrompt();
        Assert.IsNotNull(prompt);
        Assert.AreEqual(GamePromptType.ChooseStartingPlayer, prompt.Type);
        Assert.AreEqual("p2", prompt.RequestedPlayerId);
        Assert.IsTrue(game.ActionLog.Any(entry => entry.ActionType == "player_joined" && entry.PlayerId == "p2"));
        Assert.IsTrue(game.ActionLog.Any(entry => entry.ActionType == "prompt_created"));
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

        var prompt = game.GetPendingPrompt();
        Assert.IsNotNull(prompt);

        registry.ResolvePrompt(game.Id, prompt.RequestedPlayerId, "p2");

        Assert.AreEqual("p2", game.State.ActivePlayerId);
        Assert.IsNull(game.GetPendingPrompt());
        Assert.IsTrue(game.ActionLog.Any(entry => entry.ActionType == "prompt_resolved" && entry.PlayerId == prompt.RequestedPlayerId));
        Assert.IsTrue(game.ActionLog.Any(entry => entry.ActionType == "phase_started" && entry.PlayerId == "p2"));
    }

    [TestMethod]
    public void Join_Throws_WhenGameIsMissing()
    {
        var ex = Assert.ThrowsException<KeyNotFoundException>(() =>
            registry.Join("missing", new Player { Id = "p2", Deck = ["card-1"] }));

        Assert.AreEqual("Game instance 'missing' was not found.", ex.Message);
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