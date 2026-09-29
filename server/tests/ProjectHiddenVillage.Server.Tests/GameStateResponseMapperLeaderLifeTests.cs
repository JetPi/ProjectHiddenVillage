using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// Leader life is only bounded from below: card effects may heal a leader *above* its printed maximum
/// (<see cref="LeaderCardInstanceState.TotalLife"/>; N-010's "[During Your Opponent's Attack] Summon this card
/// and you gain 2 Life."). The board renders the resolved <c>CurrentLife</c> from this response, so the mapper
/// must publish the real value - it used to clamp it to <c>TotalLife</c>, which made every life gain look like
/// a no-op once the leader was at full life.
/// </summary>
[TestClass]
public sealed class GameStateResponseMapperLeaderLifeTests
{
    [TestMethod]
    public void ToGameStateResponse_PublishesLeaderLifeAboveTotalLife()
    {
        var state = BuildState(leaderCurrentLife: 7);

        var response = GameStateResponseMapper.ToGameStateResponse(state, "p1");

        var leader = response.Players.Single(player => player.PlayerId == "p1").Leader;
        Assert.AreEqual(5, leader.TotalLife);
        Assert.AreEqual(7, leader.CurrentLife);
    }

    [TestMethod]
    public void ToGameStateResponse_AppliesLeaderLifeGainEffect_AboveTotalLife()
    {
        var state = BuildState(leaderCurrentLife: 5);
        state.AppliedCardEffects.Add(new AppliedCardEffectState
        {
            Id = "gain-life",
            EffectSpecId = "gain-health",
            SourceCardInstanceId = "support-1",
            TargetCardInstanceId = "leader-p1",
            ModifierKind = AppliedCardModifierKind.Attribute,
            DurationMode = EffectDurationMode.DuringThisTurn,
            AttributeType = EffectAttributeType.LeaderCurrentLife,
            AttributeOperation = AttributeModificationOperation.Add,
            AttributeValue = 2,
            AppliedByPlayerId = "p1",
            AppliedTurnNumber = state.TurnNumber,
        });

        var response = GameStateResponseMapper.ToGameStateResponse(state, "p1");

        var leader = response.Players.Single(player => player.PlayerId == "p1").Leader;
        Assert.AreEqual(5, leader.TotalLife);
        Assert.AreEqual(7, leader.CurrentLife);
    }

    [TestMethod]
    public void ToGameStateResponse_KeepsLeaderLifeBoundedFromBelow()
    {
        var state = BuildState(leaderCurrentLife: 1);
        state.AppliedCardEffects.Add(new AppliedCardEffectState
        {
            Id = "lose-life",
            EffectSpecId = "lose-life",
            SourceCardInstanceId = "support-1",
            TargetCardInstanceId = "leader-p1",
            ModifierKind = AppliedCardModifierKind.Attribute,
            DurationMode = EffectDurationMode.DuringThisTurn,
            AttributeType = EffectAttributeType.LeaderCurrentLife,
            AttributeOperation = AttributeModificationOperation.Subtract,
            AttributeValue = 3,
            AppliedByPlayerId = "p1",
            AppliedTurnNumber = state.TurnNumber,
        });

        var response = GameStateResponseMapper.ToGameStateResponse(state, "p1");

        var leader = response.Players.Single(player => player.PlayerId == "p1").Leader;
        Assert.AreEqual(0, leader.CurrentLife);
    }

    private static GameState BuildState(int leaderCurrentLife)
    {
        return new GameState
        {
            GameId = "game-1",
            Phase = GamePhase.MainPhase,
            ActivePlayerId = "p1",
            PriorityPlayerId = "p1",
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
                    RecoveryEffect = "Recover 1",
                },
            },
            Players =
            [
                BuildPlayer("p1", leaderCurrentLife),
                BuildPlayer("p2", 5),
            ],
        };
    }

    private static PlayerState BuildPlayer(string playerId, int leaderCurrentLife)
    {
        return new PlayerState
        {
            PlayerId = playerId,
            LeaderCardInstance = new LeaderCardInstanceState
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
                CurrentLife = leaderCurrentLife,
                RecoveryEffect = "Recover 1",
            },
        };
    }
}
