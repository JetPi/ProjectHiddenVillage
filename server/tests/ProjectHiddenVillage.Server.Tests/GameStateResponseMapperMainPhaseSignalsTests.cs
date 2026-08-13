using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class GameStateResponseMapperMainPhaseSignalsTests
{
    [TestMethod]
    public void ToGameStateResponse_MainPhase_EmitsTurnEndAndDeclareAttackActions()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");
        var state = BuildState(GamePhase.MainPhase, requesterId, requesterId, requesterId, opponentId);

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);

        Assert.AreEqual(2, response.AvailableActions.Count);
        Assert.IsTrue(response.AvailableActions.Any(action => action.ActionId == "turn-end" && action.Label == "End Turn"));
        Assert.IsTrue(response.AvailableActions.Any(action => action.ActionId == "declare-attack" && action.Label == "Declare Attack"));
    }

    private static GameState BuildState(
        GamePhase phase,
        string activePlayerId,
        string priorityPlayerId,
        string requesterId,
        string opponentId)
    {
        return new GameState
        {
            GameId = "ABCDE",
            Phase = phase,
            ActivePlayerId = activePlayerId,
            PriorityPlayerId = priorityPlayerId,
            CardDefinitions = new Dictionary<string, Card>(StringComparer.Ordinal)
            {
                ["leader-def"] = new LeaderCard
                {
                    Id = "leader-def",
                    DisplayName = "Leader",
                    Name = ["Leader"],
                    Traits = ["Leader"],
                    Type = CardType.Leader,
                    Color = CardColor.Blue,
                    Life = 5,
                    RecoveryEffect = "Recover 1"
                }
            },
            Players =
            [
                new PlayerState
                {
                    PlayerId = requesterId,
                    LeaderCardInstance = CreateLeader(requesterId)
                },
                new PlayerState
                {
                    PlayerId = opponentId,
                    LeaderCardInstance = CreateLeader(opponentId)
                }
            ]
        };
    }

    private static LeaderCardInstanceState CreateLeader(string playerId)
    {
        return new LeaderCardInstanceState
        {
            InstanceId = $"leader-{playerId}",
            CardDefinitionId = "leader-def",
            OwnerPlayerId = playerId,
            ControllerPlayerId = playerId,
            Name = "Leader",
            Color = CardColor.Blue,
            Traits = ["Leader"],
            Damage = 0,
            Power = 0,
            TotalLife = 5,
            CurrentLife = 5,
            RecoveryEffect = "Recover 1"
        };
    }
}
