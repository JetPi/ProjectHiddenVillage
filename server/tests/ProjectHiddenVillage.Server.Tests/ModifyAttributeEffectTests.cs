using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class ModifyAttributeEffectTests
{
    [TestMethod]
    public void Execute_SelectedTargetCardPower_AddThenMultiply_UpdatesPowerOverride()
    {
        var targetCard = new CardInstance
        {
            InstanceId = "card-instance-1",
            CardDefinitionId = "char-1",
            OwnerPlayerId = "p2",
            ControllerPlayerId = "p2"
        };

        var effectSpec = new EffectSpec
        {
            RuntimeEffectType = RuntimeEffects.ChangeValues,
            AttributeModifications =
            [
                new AttributeModificationSpec
                {
                    TargetType = AttributeModificationTargetType.SelectedTargets,
                    Attribute = EffectAttributeType.CardPower,
                    Operation = AttributeModificationOperation.Add,
                    Value = 3
                },
                new AttributeModificationSpec
                {
                    TargetType = AttributeModificationTargetType.SelectedTargets,
                    Attribute = EffectAttributeType.CardPower,
                    Operation = AttributeModificationOperation.Multiply,
                    Value = 2
                }
            ]
        };

        var context = CreateContext(effectSpec, targetCard, playerTwoCurrentLife: 6, playerTwoTotalLife: 6);
        var effect = CreateEffect(effectSpec);

        var result = effect.Execute(
            context,
            [new GameEffectTargetReference("p2", PlayerZone.CharacterField, "card-instance-1")]);

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(10, targetCard.PowerOverride);
    }

    [TestMethod]
    public void Execute_OpponentLeaderCurrentLife_Subtract_UpdatesLeaderLife()
    {
        var effectSpec = new EffectSpec
        {
            RuntimeEffectType = RuntimeEffects.ChangeValues,
            AttributeModifications =
            [
                new AttributeModificationSpec
                {
                    TargetType = AttributeModificationTargetType.Leader,
                    TargetPlayerScope = TargetPlayerScope.Opponent,
                    Attribute = EffectAttributeType.LeaderCurrentLife,
                    Operation = AttributeModificationOperation.Subtract,
                    Value = 2
                }
            ]
        };

        var context = CreateContext(effectSpec, targetCard: null, playerTwoCurrentLife: 6, playerTwoTotalLife: 6);
        var effect = CreateEffect(effectSpec);

        var result = effect.Execute(context, []);

        Assert.IsFalse(result.IsError);
        var opponentLeader = context.Game.State.Players.First(player => player.PlayerId == "p2").LeaderCardInstance!;
        Assert.AreEqual(4, opponentLeader.CurrentLife);
    }

    [TestMethod]
    public void Execute_LeaderCurrentLife_Add_ClampsToTotalLife()
    {
        var effectSpec = new EffectSpec
        {
            RuntimeEffectType = RuntimeEffects.ChangeValues,
            AttributeModifications =
            [
                new AttributeModificationSpec
                {
                    TargetType = AttributeModificationTargetType.Leader,
                    TargetPlayerScope = TargetPlayerScope.Player,
                    Attribute = EffectAttributeType.LeaderCurrentLife,
                    Operation = AttributeModificationOperation.Add,
                    Value = 3
                }
            ]
        };

        var context = CreateContext(effectSpec, targetCard: null, playerTwoCurrentLife: 6, playerTwoTotalLife: 6);
        var actingLeader = context.Game.State.Players.First(player => player.PlayerId == "p1").LeaderCardInstance!;
        actingLeader.TotalLife = 5;
        actingLeader.CurrentLife = 4;

        var effect = CreateEffect(effectSpec);
        var result = effect.Execute(context, []);

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(5, actingLeader.CurrentLife);
    }

    private static ModifyAttributeEffect CreateEffect(EffectSpec effectSpec)
    {
        return new ModifyAttributeEffect(
            effectSpecResolver: new StubEffectSpecResolver(effectSpec),
            canExecuteEvaluator: new StubCanExecuteEvaluator(),
            targetResolver: new StubTargetResolver());
    }

    private static GameCardEffectContext CreateContext(
        EffectSpec effectSpec,
        CardInstance? targetCard,
        int playerTwoCurrentLife,
        int playerTwoTotalLife)
    {
        var playerOne = new PlayerState
        {
            PlayerId = "p1",
            LeaderCardInstance = CreateLeader("leader-1", "p1", totalLife: 5, currentLife: 5)
        };

        var playerTwo = new PlayerState
        {
            PlayerId = "p2",
            LeaderCardInstance = CreateLeader("leader-2", "p2", totalLife: playerTwoTotalLife, currentLife: playerTwoCurrentLife)
        };

        if (targetCard is not null)
        {
            playerTwo.Battlefield.Add(targetCard);
        }

        var state = new GameState
        {
            GameId = "game-1",
            ActivePlayerId = "p1",
            PriorityPlayerId = "p1",
            Players = [playerOne, playerTwo],
            CardDefinitions =
            {
                ["char-1"] = new CharacterCard
                {
                    Id = "char-1",
                    DisplayName = "Target Character",
                    Name = ["Target Character"],
                    Type = CardType.Character,
                    Color = CardColor.Red,
                    Traits = [],
                    Description = string.Empty,
                    Damage = 0,
                    Power = 2,
                    Health = 3,
                    Effects = []
                },
                ["source-1"] = new Card
                {
                    Id = "source-1",
                    DisplayName = "Source",
                    Name = ["Source"],
                    Type = CardType.Character,
                    Color = CardColor.Green,
                    Traits = [],
                    Description = string.Empty,
                    Damage = 0,
                    Power = 1,
                    Effects = [effectSpec]
                },
                ["leader-card"] = new LeaderCard
                {
                    Id = "leader-card",
                    DisplayName = "Leader",
                    Name = ["Leader"],
                    Type = CardType.Leader,
                    Color = CardColor.Blue,
                    Traits = [],
                    Description = string.Empty,
                    Damage = 0,
                    Power = 0,
                    Life = 5,
                    Effects = []
                }
            }
        };

        var game = new GameInstance(state);

        return new GameCardEffectContext(
            game: game,
            actingPlayer: new Player { Id = "p1" },
            sourceCardDefinition: state.CardDefinitions["source-1"],
            sourceCardInstance: null,
            arguments: new Dictionary<string, string>(),
            selectedTargets: []);
    }

    private static LeaderCardInstanceState CreateLeader(string instanceId, string playerId, int totalLife, int currentLife)
    {
        return new LeaderCardInstanceState
        {
            InstanceId = instanceId,
            CardDefinitionId = "leader-card",
            OwnerPlayerId = playerId,
            ControllerPlayerId = playerId,
            Name = "Leader",
            Color = CardColor.Blue,
            Traits = [],
            Damage = 0,
            Power = 0,
            RecoveryEffect = string.Empty,
            TotalLife = totalLife,
            CurrentLife = currentLife
        };
    }

    private sealed class StubEffectSpecResolver(EffectSpec effectSpec) : IGameRuntimeEffectSpecResolver
    {
        private readonly EffectSpec effectSpec = effectSpec;

        public EffectSpec? Resolve(GameCardEffectContext context, RuntimeEffects runtimeEffect)
        {
            return runtimeEffect == RuntimeEffects.ChangeValues ? effectSpec : null;
        }
    }

    private sealed class StubCanExecuteEvaluator : IGameEffectCanExecuteEvaluator
    {
        public CanExecuteResult Evaluate(GameCardEffectContext context, EffectSpec effectSpec, bool includeValidTargets)
        {
            return new CanExecuteResult { CanExecute = true };
        }
    }

    private sealed class StubTargetResolver : IGameEffectTargetResolver
    {
        public IReadOnlyList<GameEffectTargetReference> ResolveTargets(GameCardEffectContext context, EffectSpec effectSpec)
        {
            return [];
        }
    }
}
