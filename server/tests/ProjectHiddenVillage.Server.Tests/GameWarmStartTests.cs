using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;
using ProjectHiddenVillage.Server.Engine;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// The e2e warm start: a game that has never had a client connected is walked to its first MainPhase on the
/// server. With no presence there is nothing to present, so the drain needs no acknowledgements - that is the
/// property that makes this cheap, and the first test is the one that pins it.
/// </summary>
[TestClass]
public sealed class GameWarmStartTests
{
    [TestMethod]
    public void WarmStart_ReachesTheFirstMainPhaseWithoutAnyClientConnected()
    {
        var options = new GamePhaseAutomationOptions { Enabled = true };
        var registry = CreateRegistry(options);
        var game = CreateGame(registry);
        var service = new GameWarmStartService(registry, options);

        var result = service.WarmStart(game.Id);

        Assert.IsFalse(result.IsError, result.IsError ? result.FirstError.Description : null);
        Assert.AreEqual("MainPhase", result.Value.Phase);
        Assert.AreEqual(game.Id, result.Value.Id);
        Assert.AreEqual(1, result.Value.TurnNumber);

        // Nothing was left waiting on a client that does not exist.
        Assert.IsNull(game.PendingPhasePresentation);
        Assert.IsNull(game.GetPendingPrompt());
    }

    [TestMethod]
    public void WarmStart_KeepsTheDealtHandBecauseTheMulligansAreAnsweredWithNoMulligan()
    {
        var options = new GamePhaseAutomationOptions { Enabled = true };
        var registry = CreateRegistry(options);
        var game = CreateGame(registry);
        var service = new GameWarmStartService(registry, options);

        service.WarmStart(game.Id);

        // Five dealt to each, and the player who starts draws one on their first turn - the drawing player's
        // first-turn rule. Nothing was mulliganed away: a mulligan would have replaced the hand, not grown it.
        Assert.AreEqual(6, game.State.Players[0].Hand.Count);
        Assert.AreEqual(5, game.State.Players[1].Hand.Count);
    }

    [TestMethod]
    public void WarmStart_MakesTheRequestedPlayerStart_WhicheverPlayerThePromptAsked()
    {
        foreach (var startingPlayerPosition in new[] { 0, 1 })
        {
            var options = new GamePhaseAutomationOptions { Enabled = true };
            var registry = CreateRegistry(options);
            var game = CreateGame(registry);
            var expectedStartingPlayerId = game.State.Players[startingPlayerPosition].PlayerId;
            var service = new GameWarmStartService(registry, options);

            var result = service.WarmStart(game.Id, startingPlayerPosition);

            Assert.IsFalse(result.IsError, result.IsError ? result.FirstError.Description : null);
            Assert.AreEqual(
                expectedStartingPlayerId,
                result.Value.ActivePlayerId,
                $"Position {startingPlayerPosition} should own the first MainPhase.");
        }
    }

    [TestMethod]
    public void WarmStart_RefusesWhenThePhaseAutomationIsOff()
    {
        var options = new GamePhaseAutomationOptions { Enabled = false };
        var registry = CreateRegistry(options);
        var game = CreateGame(registry);
        var service = new GameWarmStartService(registry, options);

        var result = service.WarmStart(game.Id);

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Game.WarmStart.AutomationDisabled", result.FirstError.Code);
    }

    [TestMethod]
    public void WarmStart_ReturnsNotFoundForAnUnknownGame()
    {
        var options = new GamePhaseAutomationOptions { Enabled = true };
        var service = new GameWarmStartService(CreateRegistry(options), options);

        var result = service.WarmStart("ZZZZZ");

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Game.WarmStart.NotFound", result.FirstError.Code);
    }

    [TestMethod]
    public void WarmStart_RejectsANegativeStartingPlayerPosition()
    {
        var options = new GamePhaseAutomationOptions { Enabled = true };
        var registry = CreateRegistry(options);
        var game = CreateGame(registry);
        var service = new GameWarmStartService(registry, options);

        var result = service.WarmStart(game.Id, startingPlayerPosition: -1);

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Game.WarmStart.InvalidStartingPlayer", result.FirstError.Code);
    }

    private static InMemoryGameInstanceRegistry CreateRegistry(GamePhaseAutomationOptions options)
    {
        return new InMemoryGameInstanceRegistry(
            new GameInstanceFactory(),
            new GamePhaseService(new GamePhaseStateService()),
            phaseAutomation: options);
    }

    private static GameInstance CreateGame(InMemoryGameInstanceRegistry registry)
    {
        // Twelve cards each: the opening deal takes five and every turn draws one, so the walk cannot deck out.
        return registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = BuildDeck() },
                new Player { Id = "p2", Deck = BuildDeck() }
            ],
            cardDefinitions: BuildDefinitions("card-1"),
            random: new Random(1));
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
                Color = CardColor.Blue,
                Description = string.Empty,
                Damage = 2,
                Power = 2,
                Conditions = [],
                Effects = []
            },
            comparer: StringComparer.Ordinal);
    }
}
