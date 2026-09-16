using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// "You cannot turn your CHAKRA face-up" (N-016) as its own player-scoped concept: the audience comes from
/// the effect's <see cref="EffectSpec.TargetRange"/>, so one node can lock the activator, the opponent, or
/// both without asking for a card selection.
/// </summary>
[TestClass]
public sealed class LockChakraRecoveryEffectTests
{
    [TestMethod]
    public void Execute_LocksTheActingPlayer_WhenTargetRangeIsSelf()
    {
        var effectSpec = BuildLockSpec(EffectTargetRange.Self);
        var context = CreateContext();
        var effect = CreateEffect(effectSpec);

        var result = effect.Execute(context, []);

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(1, CountLocks(context));
        Assert.AreEqual("p1", context.Game.State.AppliedCardEffects
            .Single(applied => applied.ModifierKind == AppliedCardModifierKind.ChakraRecoveryLock)
            .TargetPlayerId);
        Assert.IsTrue(IsLocked(context, "p1"));
        Assert.IsFalse(IsLocked(context, "p2"));
    }

    [TestMethod]
    public void Execute_LocksTheOpponent_WhenTargetRangeIsOpponent()
    {
        var effectSpec = BuildLockSpec(EffectTargetRange.Opponent);
        var context = CreateContext();
        var effect = CreateEffect(effectSpec);

        var result = effect.Execute(context, []);

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(1, CountLocks(context));
        Assert.IsFalse(IsLocked(context, "p1"));
        Assert.IsTrue(IsLocked(context, "p2"));
    }

    [TestMethod]
    public void Execute_LocksBothPlayers_WhenTargetRangeIsAny()
    {
        var effectSpec = BuildLockSpec(EffectTargetRange.Any);
        var context = CreateContext();
        var effect = CreateEffect(effectSpec);

        var result = effect.Execute(context, []);

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(2, CountLocks(context));
        Assert.IsTrue(IsLocked(context, "p1"));
        Assert.IsTrue(IsLocked(context, "p2"));
    }

    [TestMethod]
    public void Execute_RejectsInstantDuration()
    {
        var effectSpec = BuildLockSpec(EffectTargetRange.Self);
        effectSpec.DurationMode = EffectDurationMode.Instant;

        var context = CreateContext();
        var effect = CreateEffect(effectSpec);

        var result = effect.Execute(context, []);

        Assert.IsTrue(result.IsError);
        Assert.IsTrue(result.FirstError.Code.Contains("LockChakraRecovery", StringComparison.Ordinal));
        Assert.AreEqual(0, CountLocks(context));
    }

    [TestMethod]
    public void CanExecute_ReportsInstantDuration_AsNotExecutable()
    {
        var effectSpec = BuildLockSpec(EffectTargetRange.Self);
        effectSpec.DurationMode = EffectDurationMode.Instant;

        var canExecute = CreateEffect(effectSpec).CanExecute(CreateContext());

        Assert.IsFalse(canExecute.CanExecute);
        Assert.IsTrue(canExecute.FailedConditions.Any(condition =>
            condition.Contains("temporary duration", StringComparison.OrdinalIgnoreCase)));
    }

    [TestMethod]
    public void CanExecute_Succeeds_ForATemporaryDuration()
    {
        var canExecute = CreateEffect(BuildLockSpec(EffectTargetRange.Opponent)).CanExecute(CreateContext());

        Assert.IsTrue(canExecute.CanExecute);
    }

    private static int CountLocks(GameCardEffectContext context)
    {
        return context.Game.State.AppliedCardEffects.Count(applied =>
            applied.ModifierKind == AppliedCardModifierKind.ChakraRecoveryLock);
    }

    private static bool IsLocked(GameCardEffectContext context, string playerId)
    {
        return context.Game.State.AppliedCardEffects.Any(applied =>
            applied.ModifierKind == AppliedCardModifierKind.ChakraRecoveryLock
            && string.Equals(applied.TargetPlayerId, playerId, StringComparison.Ordinal));
    }

    private static EffectSpec BuildLockSpec(EffectTargetRange targetRange)
    {
        return new EffectSpec
        {
            Id = "chakra-freeze",
            RuntimeEffectType = RuntimeEffects.LockChakraRecovery,
            EffectType = EffectKind.Support,
            Timing = EffectTiming.SupportActivated,
            DurationMode = EffectDurationMode.UntilTheEndOfYourNextTurn,
            TargetRange = targetRange,
            ExecutionTargetSource = EffectExecutionTargetSource.None,
        };
    }

    private static LockChakraRecoveryEffect CreateEffect(EffectSpec effectSpec)
    {
        return new LockChakraRecoveryEffect(
            effectSpecResolver: new StubEffectSpecResolver(effectSpec),
            canExecuteEvaluator: new StubCanExecuteEvaluator());
    }

    private static GameCardEffectContext CreateContext()
    {
        var state = new GameState
        {
            GameId = "game-1",
            ActivePlayerId = "p1",
            PriorityPlayerId = "p1",
            TurnNumber = 3,
            Players =
            [
                new PlayerState
                {
                    PlayerId = "p1",
                    ResourcePool = 5,
                    LeaderCardInstance = CreateLeader("leader-1", "p1"),
                },
                new PlayerState
                {
                    PlayerId = "p2",
                    ResourcePool = 5,
                    LeaderCardInstance = CreateLeader("leader-2", "p2"),
                },
            ],
            CardDefinitions =
            {
                ["source-def"] = new CharacterCard
                {
                    Id = "source-def",
                    DisplayName = "Source",
                    Name = ["Source"],
                    Type = CardType.Character,
                    Color = CardColor.Blue,
                    Traits = [],
                    Description = string.Empty,
                    Damage = 1,
                    Power = 5,
                    Health = 6,
                },
                ["leader-def"] = new LeaderCard
                {
                    Id = "leader-def",
                    DisplayName = "Leader",
                    Name = ["Leader"],
                    Type = CardType.Leader,
                    Color = CardColor.Blue,
                    Traits = ["Leader"],
                    Description = string.Empty,
                    Power = 3,
                    Damage = 1,
                    Life = 15,
                    Effects = [],
                },
            },
        };

        var game = new GameInstance(state);

        return new GameCardEffectContext(
            game: game,
            actingPlayer: new Player { Id = "p1" },
            sourceCardDefinition: state.CardDefinitions["source-def"],
            sourceCardInstance: new CardInstance
            {
                InstanceId = "source-instance",
                CardDefinitionId = "source-def",
                OwnerPlayerId = "p1",
                ControllerPlayerId = "p1",
            },
            arguments: new Dictionary<string, string>(StringComparer.Ordinal),
            selectedTargets: []);
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
            Damage = 1,
            Power = 3,
            RecoveryEffect = string.Empty,
            TotalLife = 15,
            CurrentLife = 15,
        };
    }

    private sealed class StubEffectSpecResolver(EffectSpec effectSpec) : IGameRuntimeEffectSpecResolver
    {
        private readonly EffectSpec effectSpec = effectSpec;

        public EffectSpec? Resolve(GameCardEffectContext context, RuntimeEffects runtimeEffect)
        {
            return runtimeEffect == RuntimeEffects.LockChakraRecovery ? effectSpec : null;
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
