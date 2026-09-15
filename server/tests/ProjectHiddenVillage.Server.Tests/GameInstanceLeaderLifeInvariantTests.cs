using ProjectHiddenVillage.Server;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// Leader life is only bounded from below: card effects may heal a leader *above* its printed maximum
/// (<see cref="LeaderCardInstanceState.TotalLife"/>) and whether that should ever be capped is still an
/// open rule question, so the invariant must not fail on it.
/// </summary>
[TestClass]
public sealed class GameInstanceLeaderLifeInvariantTests
{
    [TestMethod]
    public void ValidateInvariants_AllowsLeaderLifeAboveTheStartingMaximum()
    {
        var game = new GameInstance(BuildState(leaderCurrentLife: 17));

        game.ValidateInvariants();

        Assert.AreEqual(17, game.State.Players[0].LeaderCardInstance!.CurrentLife);
    }

    [TestMethod]
    public void ValidateInvariants_RejectsNegativeLeaderLife()
    {
        var exception = Assert.ThrowsException<InvalidOperationException>(() =>
            new GameInstance(BuildState(leaderCurrentLife: -1)));

        StringAssert.Contains(exception.Message, "has invalid CurrentLife");
    }

    private static GameState BuildState(int leaderCurrentLife)
    {
        return new GameState
        {
            GameId = "game-1",
            TurnNumber = 1,
            CardDefinitions = new Dictionary<string, Card>(StringComparer.Ordinal)
            {
                ["leader-def"] = new LeaderCard
                {
                    Id = "leader-def",
                    DisplayName = "Leader",
                    Name = ["Leader"],
                    Type = CardType.Leader,
                    Color = CardColor.Red,
                    Traits = ["Leader"],
                    Description = string.Empty,
                    Damage = 1,
                    Power = 3,
                    Life = 10,
                },
            },
            Players =
            [
                BuildPlayer("p1", leaderCurrentLife),
                BuildPlayer("p2", leaderCurrentLife),
            ],
            EffectResolutionStack = [],
        };
    }

    private static PlayerState BuildPlayer(string playerId, int leaderCurrentLife)
    {
        return new PlayerState
        {
            PlayerId = playerId,
            LeaderCardInstance = new LeaderCardInstanceState
            {
                InstanceId = $"{playerId}-leader",
                CardDefinitionId = "leader-def",
                OwnerPlayerId = playerId,
                ControllerPlayerId = playerId,
                TotalLife = 10,
                CurrentLife = leaderCurrentLife,
            },
        };
    }
}
