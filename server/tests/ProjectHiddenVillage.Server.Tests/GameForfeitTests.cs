using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.Games;
using ProjectHiddenVillage.Server.Engine;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// Resigning: a player ends the game themselves, the opponent wins, and nothing of the game in progress outlives the
/// result. It resolves through the same write-once forfeit path the action clock uses, so it works at any moment -
/// including mid-transition and during the opponent's turn.
/// </summary>
[TestClass]
public sealed class GameForfeitTests
{
    [TestMethod]
    public void ForfeitGame_EndsTheGameInstantly_WithTheOpponentAsWinner()
    {
        var registry = CreateRegistry();
        var game = CreateGame(registry);

        registry.ForfeitGame(game.Id, "p1");

        Assert.IsNotNull(game.State.Outcome, "A resignation has to end the game on the spot.");
        Assert.AreEqual(GameEndReason.Resigned, game.State.Outcome.Reason);
        CollectionAssert.AreEqual(new[] { "p1" }, game.State.Outcome.LoserPlayerIds.ToArray());
        Assert.AreEqual("p2", game.State.Outcome.WinnerPlayerId);

        // Nothing is left waiting on the resigned player: no clock, no deadline.
        Assert.IsNull(game.Clock?.OwningPlayerId);
        Assert.IsNull(game.Clock?.DeadlineUtc);

        Assert.IsTrue(
            game.ActionLog.Any(entry => entry.ActionType == GameEndRules.GameEndedActionType),
            "The end has to reach the action log like every other outcome.");
        var endEntry = game.ActionLog.Single(entry => entry.ActionType == GameEndRules.GameEndedActionType);
        Assert.AreEqual("Resigned", endEntry.Metadata["reason"]);
        Assert.AreEqual("p2", endEntry.Metadata["winnerPlayerId"]);
    }

    [TestMethod]
    public void ForfeitGame_ClearsAnOutstandingPresentation()
    {
        var presence = new GamePresenceTracker();
        var registry = CreateRegistry(presence: presence);
        var game = CreateGame(registry);
        presence.RegisterConnection(game.Id, "p1", "connection-1");
        presence.RegisterConnection(game.Id, "p2", "connection-2");

        ResolveStartingPrompt(registry, game);
        Assert.IsNotNull(game.PendingPhasePresentation, "The opening deal is presented until it is acknowledged.");

        registry.ForfeitGame(game.Id, "p1");

        Assert.IsNull(
            game.PendingPhasePresentation,
            "A presentation the opponents were still animating must not outlive the game.");
        Assert.AreEqual(GameEndReason.Resigned, game.State.Outcome!.Reason);
        Assert.AreEqual("p2", game.State.Outcome.WinnerPlayerId);
    }

    [TestMethod]
    public void ForfeitGame_LeavesAFinishedGameUntouched()
    {
        var registry = CreateRegistry();
        var game = CreateGame(registry);

        registry.ForfeitGame(game.Id, "p1");
        var outcome = game.State.Outcome;

        registry.ForfeitGame(game.Id, "p1");

        Assert.AreSame(outcome, game.State.Outcome, "A second resignation changes nothing and throws nothing.");
        Assert.AreEqual(
            1,
            game.ActionLog.Count(entry => entry.ActionType == GameEndRules.GameEndedActionType));
    }

    [TestMethod]
    public void ForfeitGame_RejectsAPlayerWhoIsNotInTheGame()
    {
        var registry = CreateRegistry();
        var game = CreateGame(registry);

        Assert.ThrowsException<InvalidOperationException>(() => registry.ForfeitGame(game.Id, "outsider"));
        Assert.IsNull(game.State.Outcome);
    }

    private static InMemoryGameInstanceRegistry CreateRegistry(GamePresenceTracker? presence = null)
    {
        return new InMemoryGameInstanceRegistry(
            new GameInstanceFactory(),
            new GamePhaseService(new GamePhaseStateService()),
            phaseAutomation: new GamePhaseAutomationOptions { Enabled = true, PresentationAckTimeoutMs = 0 },
            presenceTracker: presence);
    }

    private static GameInstance CreateGame(InMemoryGameInstanceRegistry registry)
    {
        return registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = BuildDeck() },
                new Player { Id = "p2", Deck = BuildDeck() }
            ],
            cardDefinitions: BuildDefinitions("card-1"),
            random: new FixedIndexRandom(0));
    }

    private static List<string> BuildDeck()
    {
        return Enumerable.Repeat("card-1", 12).ToList();
    }

    private static void ResolveStartingPrompt(InMemoryGameInstanceRegistry registry, GameInstance game)
    {
        var startingPrompt = game.GetPendingPrompt()
            ?? throw new InvalidOperationException("The game has no starting-player prompt.");
        registry.ResolvePrompt(game.Id, startingPrompt.RequestedPlayerId, "goFirst");
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
                Damage = 2,
                Power = 2,
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
