using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class AlterResourcesEffectTests
{
    [TestMethod]
    public void Execute_PaysChakra_AndFlipsActingPlayerSummonCardFaceDown()
    {
        var effectSpec = new EffectSpec
        {
            RuntimeEffectType = RuntimeEffects.AlterResources,
            ChakraAdjustments =
            [
                new ChakraAdjustmentSpec
                {
                    TargetRange = EffectTargetRange.Self,
                    Operation = ChakraAdjustmentOperation.Pay,
                    Amount = 2,
                }
            ],
            SummonCardFlips =
            [
                new SummonCardFlipSpec
                {
                    TargetRange = EffectTargetRange.Self,
                    FaceState = SummonCardFaceState.FaceDown,
                }
            ]
        };

        var context = CreateContext(effectSpec, playerOneResource: 3, playerTwoResource: 1);
        var effect = CreateEffect(effectSpec);

        var result = effect.Execute(context, []);

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(1, context.Game.State.Players[0].ResourcePool);
        Assert.IsFalse(context.Game.State.Player1SummonCard);
        Assert.IsTrue(context.Game.State.Player2SummonCard);
    }

    [TestMethod]
    public void Execute_RecoversOpponentChakra_AndFlipsOpponentSummonCardFaceUp()
    {
        var effectSpec = new EffectSpec
        {
            RuntimeEffectType = RuntimeEffects.AlterResources,
            ChakraAdjustments =
            [
                new ChakraAdjustmentSpec
                {
                    TargetRange = EffectTargetRange.Opponent,
                    Operation = ChakraAdjustmentOperation.Recover,
                    Amount = 3,
                }
            ],
            SummonCardFlips =
            [
                new SummonCardFlipSpec
                {
                    TargetRange = EffectTargetRange.Opponent,
                    FaceState = SummonCardFaceState.FaceUp,
                }
            ]
        };

        var context = CreateContext(effectSpec, playerOneResource: 2, playerTwoResource: 0);
        context.Game.State.Player2SummonCard = false;

        var effect = CreateEffect(effectSpec);
        var result = effect.Execute(context, []);

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(2, context.Game.State.Players[0].ResourcePool);
        Assert.AreEqual(3, context.Game.State.Players[1].ResourcePool);
        Assert.IsTrue(context.Game.State.Player2SummonCard);
    }

    [TestMethod]
    public void CanExecute_Fails_WhenPayAmountExceedsAvailableChakra()
    {
        var effectSpec = new EffectSpec
        {
            RuntimeEffectType = RuntimeEffects.AlterResources,
            ChakraAdjustments =
            [
                new ChakraAdjustmentSpec
                {
                    TargetRange = EffectTargetRange.Self,
                    Operation = ChakraAdjustmentOperation.Pay,
                    Amount = 2,
                }
            ]
        };

        var context = CreateContext(effectSpec, playerOneResource: 1, playerTwoResource: 0);
        var effect = CreateEffect(effectSpec);

        var canExecute = effect.CanExecute(context);

        Assert.IsFalse(canExecute.CanExecute);
        Assert.IsTrue(canExecute.FailedConditions.Any(message =>
            message.Contains("does not have enough chakra", StringComparison.OrdinalIgnoreCase)));
    }

    [TestMethod]
    public void Execute_RegistersFaceStateLock_ForTargetPlayer()
    {
        var effectSpec = new EffectSpec
        {
            Id = "effect-face-lock",
            RuntimeEffectType = RuntimeEffects.AlterResources,
            DurationMode = EffectDurationMode.DuringOpponentNextTurn,
            FaceStateLocks =
            [
                new FaceStateLockSpec
                {
                    TargetCategory = FaceStateTargetCategory.SummonCard,
                    Operation = FaceStateLockOperation.CannotTurnFaceUp,
                    TargetRange = EffectTargetRange.Self,
                }
            ]
        };

        var sourceCardInstance = new CardInstance
        {
            InstanceId = "source-instance",
            CardDefinitionId = "source-def",
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
        };

        var context = CreateContext(effectSpec, playerOneResource: 3, playerTwoResource: 3, sourceCardInstance);

        var effect = CreateEffect(effectSpec);
        var result = effect.Execute(context, []);

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(1, context.Game.State.AppliedCardEffects.Count);

        var appliedLock = context.Game.State.AppliedCardEffects[0];
        Assert.AreEqual(AppliedCardModifierKind.FaceStateLock, appliedLock.ModifierKind);
        Assert.AreEqual(FaceStateTargetCategory.SummonCard, appliedLock.FaceStateTargetCategory);
        Assert.AreEqual(FaceStateLockOperation.CannotTurnFaceUp, appliedLock.FaceStateLockOperation);
        Assert.AreEqual("p1", appliedLock.TargetPlayerId);
        Assert.AreEqual(EffectDurationMode.DuringOpponentNextTurn, appliedLock.DurationMode);
    }

    [TestMethod]
    public void Execute_Fails_WhenSummonFaceUpIsBlockedByActiveLock()
    {
        var setupEffectSpec = new EffectSpec
        {
            Id = "effect-setup-lock",
            RuntimeEffectType = RuntimeEffects.AlterResources,
            DurationMode = EffectDurationMode.DuringThisTurn,
            FaceStateLocks =
            [
                new FaceStateLockSpec
                {
                    TargetCategory = FaceStateTargetCategory.SummonCard,
                    Operation = FaceStateLockOperation.CannotTurnFaceUp,
                    TargetRange = EffectTargetRange.Self,
                }
            ]
        };

        var sourceCardInstance = new CardInstance
        {
            InstanceId = "source-instance",
            CardDefinitionId = "source-def",
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
        };

        var context = CreateContext(setupEffectSpec, playerOneResource: 3, playerTwoResource: 3, sourceCardInstance);

        var setupEffect = CreateEffect(setupEffectSpec);
        var setupResult = setupEffect.Execute(context, []);
        Assert.IsFalse(setupResult.IsError);

        var flipEffectSpec = new EffectSpec
        {
            Id = "effect-flip-face-up",
            RuntimeEffectType = RuntimeEffects.AlterResources,
            SummonCardFlips =
            [
                new SummonCardFlipSpec
                {
                    TargetRange = EffectTargetRange.Self,
                    FaceState = SummonCardFaceState.FaceUp,
                }
            ]
        };

        var flipContext = CreateContext(flipEffectSpec, playerOneResource: 3, playerTwoResource: 3);
        flipContext.Game.State.AppliedCardEffects = context.Game.State.AppliedCardEffects;
        flipContext.Game.State.Player1SummonCard = false;

        var flipEffect = CreateEffect(flipEffectSpec);
        var flipResult = flipEffect.Execute(flipContext, []);

        Assert.IsTrue(flipResult.IsError);
        Assert.IsTrue(flipResult.FirstError.Code.Contains("FaceStateLock", StringComparison.Ordinal));
        Assert.IsFalse(flipContext.Game.State.Player1SummonCard);
    }

    private static AlterResourcesEffect CreateEffect(EffectSpec effectSpec)
    {
        return new AlterResourcesEffect(
            effectSpecResolver: new StubEffectSpecResolver(effectSpec),
            canExecuteEvaluator: new StubCanExecuteEvaluator());
    }

    private static GameCardEffectContext CreateContext(
        EffectSpec effectSpec,
        int playerOneResource,
        int playerTwoResource,
        CardInstance? sourceCardInstance = null)
    {
        var state = new GameState
        {
            GameId = "game-1",
            ActivePlayerId = "p1",
            PriorityPlayerId = "p1",
            Players =
            [
                new PlayerState
                {
                    PlayerId = "p1",
                    ResourcePool = playerOneResource,
                    LeaderCardInstance = CreateLeader("leader-1", "p1")
                },
                new PlayerState
                {
                    PlayerId = "p2",
                    ResourcePool = playerTwoResource,
                    LeaderCardInstance = CreateLeader("leader-2", "p2")
                }
            ],
            CardDefinitions =
            {
                ["source-def"] = CreateCharacterDefinition(effectSpec),
                ["leader-def"] = new LeaderCard
                {
                    Id = "leader-def",
                    DisplayName = "Leader",
                    Name = ["Leader"],
                    Type = CardType.Leader,
                    Color = CardColor.Blue,
                    Traits = ["Leader"],
                    Description = string.Empty,
                    Power = 0,
                    Damage = 0,
                    Life = 5,
                    Effects = []
                }
            }
        };

        var game = new GameInstance(state);

        return new GameCardEffectContext(
            game: game,
            actingPlayer: new Player { Id = "p1" },
            sourceCardDefinition: state.CardDefinitions["source-def"],
            sourceCardInstance: sourceCardInstance,
            arguments: new Dictionary<string, string>(),
            selectedTargets: []);
    }

    private static CharacterCard CreateCharacterDefinition(EffectSpec effectSpec)
    {
        return new CharacterCard
        {
            Id = "source-def",
            DisplayName = "Source",
            Name = ["Source"],
            Type = CardType.Character,
            Color = CardColor.Red,
            Traits = [],
            Description = string.Empty,
            Damage = 0,
            Power = 2,
            Health = 3,
            Effects = [effectSpec]
        };
    }

    private static LeaderCardInstanceState CreateLeader(string instanceId, string playerId)
    {
        return new LeaderCardInstanceState
        {
            InstanceId = instanceId,
            CardDefinitionId = "leader-def",
            OwnerPlayerId = playerId,
            ControllerPlayerId = playerId,
            Name = "Leader",
            Color = CardColor.Blue,
            Traits = ["Leader"],
            Damage = 0,
            Power = 0,
            RecoveryEffect = string.Empty,
            TotalLife = 5,
            CurrentLife = 5
        };
    }

    private sealed class StubEffectSpecResolver(EffectSpec effectSpec) : IGameRuntimeEffectSpecResolver
    {
        private readonly EffectSpec effectSpec = effectSpec;

        public EffectSpec? Resolve(GameCardEffectContext context, RuntimeEffects runtimeEffect)
        {
            return runtimeEffect == RuntimeEffects.AlterResources ? effectSpec : null;
        }
    }

    private sealed class StubCanExecuteEvaluator : IGameEffectCanExecuteEvaluator
    {
        public CanExecuteResult Evaluate(GameCardEffectContext context, EffectSpec effectSpec, bool includeValidTargets)
        {
            return new CanExecuteResult { CanExecute = true };
        }
    }
}
