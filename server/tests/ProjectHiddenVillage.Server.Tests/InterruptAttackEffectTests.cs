using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class InterruptAttackEffectTests
{
    [TestMethod]
    public void Execute_WithPendingOpponentAttack_CancelsAttackAndMovesToBattleEndStep()
    {
        var effect = CreateEffect();
        var context = CreateContext(
            activePlayerId: "p1",
            actingPlayerId: "p2",
            priorityPlayerId: "p2",
            hasPendingAttack: true,
            phase: GamePhase.ActionStep);

        var result = effect.Execute(context, []);

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(GamePhase.BattleEndStep, context.Game.State.Phase);
        Assert.IsFalse(context.Game.State.HasPendingAttack);
        Assert.AreEqual(string.Empty, context.Game.State.PendingAttackDeclarationId);
        Assert.AreEqual(string.Empty, context.Game.State.PriorityPlayerId);
        Assert.AreEqual(0, context.Game.State.ConsecutivePasses);
        Assert.IsTrue(context.Game.ActionLog.Any(entry => entry.ActionType == "attack_interrupted"));
    }

    [TestMethod]
    public void CanExecute_Fails_WhenActingPlayerIsActivePlayer()
    {
        var effect = CreateEffect();
        var context = CreateContext(
            activePlayerId: "p1",
            actingPlayerId: "p1",
            priorityPlayerId: "p1",
            hasPendingAttack: true,
            phase: GamePhase.ActionStep);

        var result = effect.CanExecute(context);

        Assert.IsFalse(result.CanExecute);
        CollectionAssert.Contains(result.FailedConditions, "InterruptAttack can only be activated during an opponent attack.");
    }

    [TestMethod]
    public void CanExecute_IgnoresConfiguredTargetCounts_ForSinglePendingAttackModel()
    {
        var effect = CreateEffect(canExecuteEvaluator: new TargetCountSensitiveCanExecuteEvaluator());
        var context = CreateContext(
            activePlayerId: "p1",
            actingPlayerId: "p2",
            priorityPlayerId: "p2",
            hasPendingAttack: true,
            phase: GamePhase.ActionStep,
            exactTargetCount: 1,
            enforceTargetCount: true);

        var result = effect.CanExecute(context);

        Assert.IsTrue(result.CanExecute);
    }

    private static InterruptAttackEffect CreateEffect(IGameEffectCanExecuteEvaluator? canExecuteEvaluator = null)
    {
        return new InterruptAttackEffect(
            effectSpecResolver: new StubEffectSpecResolver(),
            canExecuteEvaluator: canExecuteEvaluator ?? new StubCanExecuteEvaluator());
    }

    private static GameCardEffectContext CreateContext(
        string activePlayerId,
        string actingPlayerId,
        string priorityPlayerId,
        bool hasPendingAttack,
        GamePhase phase,
        int? exactTargetCount = null,
        bool enforceTargetCount = false)
    {
        var sourceCard = new Card
        {
            Id = "support-1",
            DisplayName = "Interrupt Support",
            Name = ["Interrupt Support"],
            Type = CardType.Character,
            Color = CardColor.Blue,
            Traits = [],
            Description = string.Empty,
            Effects =
            [
                new EffectSpec
                {
                    Id = "interrupt-1",
                    RuntimeEffectType = RuntimeEffects.InterruptAttack,
                    EffectType = EffectKind.Support,
                    Timing = EffectTiming.DuringOpponentAttack,
                    TargetRange = EffectTargetRange.Any,
                    ContextRules = [],
                    TargetRules = new EffectTargetRuleSet
                    {
                        Operator = RequirementGroupOperator.Any,
                        ExactTargetCount = exactTargetCount,
                        Rules = []
                    }
                }
            ]
        };

        var gameState = new GameState
        {
            GameId = "ABCDE",
            Phase = phase,
            ActivePlayerId = activePlayerId,
            PriorityPlayerId = priorityPlayerId,
            HasPendingAttack = hasPendingAttack,
            PendingAttackDeclarationId = hasPendingAttack ? "attack-1" : string.Empty,
            Players =
            [
                new PlayerState { PlayerId = "p1" },
                new PlayerState { PlayerId = "p2" }
            ],
            CardDefinitions =
            {
                [sourceCard.Id] = sourceCard
            }
        };

        var game = new GameInstance(gameState);

        var arguments = new Dictionary<string, string>(StringComparer.Ordinal);
        if (enforceTargetCount)
        {
            arguments[ReactiveEffectExecutionConstants.EnforceTargetCountArgument] = bool.TrueString;
        }

        return new GameCardEffectContext(
            game: game,
            actingPlayer: new Player { Id = actingPlayerId },
            sourceCardDefinition: sourceCard,
            sourceCardInstance: new CardInstance
            {
                InstanceId = "support-inst-1",
                CardDefinitionId = sourceCard.Id,
                OwnerPlayerId = actingPlayerId,
                ControllerPlayerId = actingPlayerId,
            },
            arguments: arguments,
            selectedTargets: []);
    }

    private sealed class StubEffectSpecResolver : IGameRuntimeEffectSpecResolver
    {
        public EffectSpec? Resolve(GameCardEffectContext context, RuntimeEffects runtimeEffect)
        {
            return context.SourceCardDefinition.Effects.FirstOrDefault(effect => effect.RuntimeEffectType == runtimeEffect);
        }
    }

    private sealed class StubCanExecuteEvaluator : IGameEffectCanExecuteEvaluator
    {
        public CanExecuteResult Evaluate(GameCardEffectContext context, EffectSpec effectSpec, bool includeValidTargets)
        {
            return new CanExecuteResult { CanExecute = true };
        }
    }

    private sealed class TargetCountSensitiveCanExecuteEvaluator : IGameEffectCanExecuteEvaluator
    {
        public CanExecuteResult Evaluate(GameCardEffectContext context, EffectSpec effectSpec, bool includeValidTargets)
        {
            var shouldEnforce = context.Arguments.TryGetValue(
                ReactiveEffectExecutionConstants.EnforceTargetCountArgument,
                out var rawValue)
                && bool.TryParse(rawValue, out var parsed)
                && parsed;

            if (shouldEnforce && effectSpec.TargetRules.ExactTargetCount.HasValue)
            {
                return new CanExecuteResult
                {
                    CanExecute = false,
                    FailedConditions = ["Select at least 1 target(s)."],
                };
            }

            return new CanExecuteResult { CanExecute = true };
        }
    }
}
