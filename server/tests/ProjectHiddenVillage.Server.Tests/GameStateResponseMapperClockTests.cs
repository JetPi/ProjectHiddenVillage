using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.Games;
using ProjectHiddenVillage.Server.Engine;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// The clock as the client receives it: an absolute deadline, the server's own reading of now, what is left of the
/// stop and of each pool - and nothing at all for an untimed game or a finished one. See
/// <c>plans/game-action-clocks.md</c>.
/// </summary>
[TestClass]
public sealed class GameStateResponseMapperClockTests
{
    [TestMethod]
    public void ToGameStateResponse_PublishesTheStopTheEngineIsWaitingOn()
    {
        var registry = CreateRegistry(new TestClockProvider(DateTimeOffset.UtcNow));
        var game = CreateGame(registry);

        var response = GameStateResponseMapper.ToGameStateResponse(game, "p1");

        Assert.IsNotNull(response.Clock);
        Assert.IsTrue(response.Clock.IsEnabled);
        Assert.AreEqual(game.GetPendingPrompt()!.RequestedPlayerId, response.Clock.OwningPlayerId);
        Assert.AreEqual(nameof(GameClockStopKind.OtherStep), response.Clock.StopKind);
        Assert.IsNotNull(response.Clock.DeadlineUtc);
        Assert.AreEqual(30, response.Clock.SecondsRemainingInStop);
        Assert.AreEqual(2, response.Clock.Players.Count);

        foreach (var player in response.Clock.Players)
        {
            Assert.AreEqual(1800, player.SecondsRemainingInPool);
            Assert.AreEqual(0, player.ConsecutiveTimeouts);
            Assert.AreEqual(3, player.TimeoutsBeforeForfeit);
        }

        // The skew field is what lets a client count down without trusting its own clock.
        Assert.IsTrue(DateTimeOffset.TryParse(response.Clock.ServerNowUtc, out _));
    }

    [TestMethod]
    public void ToGameStateResponse_PublishesATimedOutStopWithItsStrike()
    {
        var clock = new TestClockProvider(new DateTimeOffset(2026, 1, 1, 12, 0, 0, TimeSpan.Zero));
        var registry = CreateRegistry(clock);
        var game = CreateGame(registry);

        var promptPlayerId = game.GetPendingPrompt()!.RequestedPlayerId;
        clock.Advance(TimeSpan.FromSeconds(30));

        var response = GameStateResponseMapper.ToGameStateResponse(game, "p1");

        Assert.IsNotNull(response.Clock);
        var struckPlayer = response.Clock.Players.Single(player => player.PlayerId == promptPlayerId);
        Assert.AreEqual(1, struckPlayer.ConsecutiveTimeouts);
        Assert.AreEqual(1770, struckPlayer.SecondsRemainingInPool);

        // The timeout answered the prompt for them, so the clock now runs on the next stop (the mulligan).
        Assert.AreEqual(nameof(GameClockStopKind.OtherStep), response.Clock.StopKind);
        Assert.AreEqual(30, response.Clock.SecondsRemainingInStop);
    }

    [TestMethod]
    public void ToGameStateResponse_PublishesAnUntimedClockForATimeRelaxedGame()
    {
        var registry = CreateRegistry(new TestClockProvider(DateTimeOffset.UtcNow));
        var game = CreateGame(registry);
        game.Ruleset = new GameRulesetBinding(
            Guid.Parse("20000000-0000-0000-0000-000000000001"),
            "standard",
            "Standard",
            GameClockPolicy.Standard);
        game.Modifiers = [GameModifierKeys.TimeRelaxed];

        // Any mutation rebuilds the clock under the ruleset's policy plus the host's modifier.
        var prompt = game.GetPendingPrompt()!;
        registry.ResolvePrompt(game.Id, prompt.RequestedPlayerId, "goFirst");

        var response = GameStateResponseMapper.ToGameStateResponse(game, "p1");

        Assert.IsNotNull(response.Clock, "The payload still names the clock so the board can say it is untimed.");
        Assert.IsFalse(response.Clock.IsEnabled);
        Assert.IsNull(response.Clock.DeadlineUtc);
        Assert.IsNull(response.Clock.SecondsRemainingInStop);
        Assert.IsNull(response.Clock.OwningPlayerId);
        CollectionAssert.AreEqual(
            new[] { GameModifierKeys.TimeRelaxed },
            response.Modifiers?.ToArray(),
            "The payload names the modifier so both clients can label the table.");
    }

    [TestMethod]
    public void ToGameStateResponse_PublishesNoClockOnceTheGameIsOver()
    {
        var registry = CreateRegistry(new TestClockProvider(DateTimeOffset.UtcNow));
        var game = CreateGame(registry);

        game.State.Outcome = new GameOutcome
        {
            WinnerPlayerId = "p1",
            LoserPlayerIds = ["p2"],
            Reason = GameEndReason.LeaderLifeDepleted,
            TurnNumber = game.State.TurnNumber,
        };

        var response = GameStateResponseMapper.ToGameStateResponse(game, "p1");

        Assert.IsNull(response.Clock, "A finished game has no clock, no deadline and no strikes left.");
        Assert.IsNotNull(response.GameOutcome);
    }

    private static InMemoryGameInstanceRegistry CreateRegistry(TimeProvider timeProvider)
    {
        return new InMemoryGameInstanceRegistry(
            new GameInstanceFactory(),
            new GamePhaseService(new GamePhaseStateService()),
            phaseAutomation: new GamePhaseAutomationOptions { Enabled = true, PresentationAckTimeoutMs = 0 },
            timeProvider: timeProvider);
    }

    private static GameInstance CreateGame(InMemoryGameInstanceRegistry registry)
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = Enumerable.Repeat("card-1", 12).ToList() },
                new Player { Id = "p2", Deck = Enumerable.Repeat("card-1", 12).ToList() }
            ],
            cardDefinitions: new Dictionary<string, Card>(StringComparer.Ordinal)
            {
                ["card-1"] = new Card
                {
                    Id = "card-1",
                    DisplayName = "card-1",
                    Name = ["card-1"],
                    Type = CardType.Character,
                    Traits = [],
                    Color = CardColor.Red,
                    Description = string.Empty,
                    Damage = 2,
                    Power = 2,
                    Conditions = [],
                    Effects = []
                }
            },
            random: new FixedIndexRandom(0));

        // The response mapper renders every player's leader, so the fixture has to have one per player.
        game.State.CardDefinitions["leader-def"] = new LeaderCard
        {
            Id = "leader-def",
            DisplayName = "Leader",
            Name = ["Leader"],
            Traits = ["Leader"],
            Type = CardType.Leader,
            Color = CardColor.Blue,
            Life = 5,
            RecoveryEffect = "Recover 1",
        };

        foreach (var player in game.State.Players)
        {
            player.LeaderCardInstance = new LeaderCardInstanceState
            {
                InstanceId = $"leader-{player.PlayerId}",
                CardDefinitionId = "leader-def",
                OwnerPlayerId = player.PlayerId,
                ControllerPlayerId = player.PlayerId,
                Name = "Leader",
                Color = CardColor.Blue,
                Traits = ["Leader"],
                Damage = 0,
                Power = 0,
                TotalLife = 5,
                CurrentLife = 5,
                RecoveryEffect = "Recover 1",
            };
        }

        return game;
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
