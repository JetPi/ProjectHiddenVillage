using ErrorOr;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class InterruptAttackEffect(
    IGameRuntimeEffectSpecResolver effectSpecResolver,
    IGameEffectCanExecuteEvaluator canExecuteEvaluator) : IGameCardEffect
{
    private readonly IGameRuntimeEffectSpecResolver effectSpecResolver = effectSpecResolver;
    private readonly IGameEffectCanExecuteEvaluator canExecuteEvaluator = canExecuteEvaluator;

    public const string EffectKey = "InterruptAttack";

    public string EffectTypeKey => EffectKey;

    public CanExecuteResult CanExecute(GameCardEffectContext context)
    {
        var effectSpec = effectSpecResolver.Resolve(context, RuntimeEffects.InterruptAttack);
        if (effectSpec is null)
        {
            return new CanExecuteResult
            {
                CanExecute = false,
                FailedConditions = ["InterruptAttack effect is not defined on the source card."],
            };
        }

        var normalizedEffectSpec = CreateImplicitAttackTargetSpec(effectSpec);
        var baseResult = canExecuteEvaluator.Evaluate(context, normalizedEffectSpec, includeValidTargets: false);
        if (!baseResult.CanExecute)
        {
            return baseResult;
        }

        if (context.Game.State.Phase != GamePhase.ActionStep)
        {
            baseResult.CanExecute = false;
            baseResult.FailedConditions.Add("InterruptAttack can only be activated during ActionStep.");
            return baseResult;
        }

        if (!string.Equals(context.Game.State.PriorityPlayerId, context.ActingPlayer.Id, StringComparison.Ordinal))
        {
            baseResult.CanExecute = false;
            baseResult.FailedConditions.Add("Only the priority player can activate InterruptAttack.");
            return baseResult;
        }

        if (string.Equals(context.Game.State.ActivePlayerId, context.ActingPlayer.Id, StringComparison.Ordinal))
        {
            baseResult.CanExecute = false;
            baseResult.FailedConditions.Add("InterruptAttack can only be activated during an opponent attack.");
            return baseResult;
        }

        if (!context.Game.State.HasPendingAttack)
        {
            baseResult.CanExecute = false;
            baseResult.FailedConditions.Add("InterruptAttack requires an active pending attack.");
            return baseResult;
        }

        return baseResult;
    }

    public IReadOnlyList<GameEffectTargetReference> GetValidTargets(GameCardEffectContext context)
    {
        return [];
    }

    public ErrorOr<Success> Execute(GameCardEffectContext context, IReadOnlyList<GameEffectTargetReference> selectedTargets)
    {
        var effectSpec = effectSpecResolver.Resolve(context, RuntimeEffects.InterruptAttack);
        if (effectSpec is null)
        {
            return Error.Validation(
                code: "Game.Effect.InterruptAttack.MissingEffectSpec",
                description: "InterruptAttack effect is not defined on the source card.");
        }

        if (context.Game.State.Phase != GamePhase.ActionStep)
        {
            return Error.Validation(
                code: "Game.Effect.InterruptAttack.InvalidPhase",
                description: "InterruptAttack can only be activated during ActionStep.");
        }

        if (!context.Game.State.HasPendingAttack)
        {
            return Error.Validation(
                code: "Game.Effect.InterruptAttack.NoPendingAttack",
                description: "InterruptAttack requires an active pending attack.");
        }

        var pendingAttackerInstanceId = context.Game.State.PendingAttackAttackerInstanceId;
        if (!string.IsNullOrWhiteSpace(pendingAttackerInstanceId))
        {
            var attacker = context.Game.State.Players
                .SelectMany(player => player.Battlefield)
                .FirstOrDefault(card => string.Equals(card.InstanceId, pendingAttackerInstanceId, StringComparison.Ordinal));

            if (attacker is not null)
            {
                attacker.IsRested = true;
            }
        }

        context.Game.State.HasPendingAttack = false;
        context.Game.State.PendingAttackDeclarationId = string.Empty;
        context.Game.State.PendingAttackAttackerInstanceId = string.Empty;
        context.Game.State.PendingAttackDefenderPlayerId = string.Empty;
        context.Game.State.PendingAttackDefenderInstanceId = string.Empty;
        context.Game.State.PendingAttackDefenderZone = null;
        context.Game.State.PendingAttackOptionalEffectSourceCardInstanceId = string.Empty;
        context.Game.State.PendingAttackOptionalEffectId = string.Empty;
        context.Game.State.PendingAttackOptionalEffectPlayerId = string.Empty;
        context.Game.State.Phase = GamePhase.BattleEndStep;
        context.Game.State.PriorityPlayerId = string.Empty;
        context.Game.State.ConsecutivePasses = 0;

        context.Game.AddActionLogEntry(
            actionType: "attack_interrupted",
            message: $"{context.ActingPlayer.Id} interrupted the pending attack.",
            playerId: context.ActingPlayer.Id,
            metadata: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["phase"] = context.Game.State.Phase.ToString(),
            });

        return Result.Success;
    }

    private static EffectSpec CreateImplicitAttackTargetSpec(EffectSpec effectSpec)
    {
        return new EffectSpec
        {
            Id = effectSpec.Id,
            RuntimeEffectType = effectSpec.RuntimeEffectType,
            EffectType = effectSpec.EffectType,
            Timing = effectSpec.Timing,
            TargetRange = effectSpec.TargetRange,
            IsOptional = effectSpec.IsOptional,
            ChakraCost = effectSpec.ChakraCost,
            EffectValue = effectSpec.EffectValue,
            GlobalRestrictions = effectSpec.GlobalRestrictions,
            PassiveMode = effectSpec.PassiveMode,
            ExecutionTargetSource = EffectExecutionTargetSource.None,
            ExecutionFlowMode = effectSpec.ExecutionFlowMode,
            ExecutionCondition = effectSpec.ExecutionCondition,
            OnSuccessEffectId = effectSpec.OnSuccessEffectId,
            OnFailureEffectId = effectSpec.OnFailureEffectId,
            PassiveReevaluation = effectSpec.PassiveReevaluation,
            PassiveConsequences = effectSpec.PassiveConsequences,
            AttributeModifications = effectSpec.AttributeModifications,
            ChakraAdjustments = effectSpec.ChakraAdjustments,
            SummonCardFlips = effectSpec.SummonCardFlips,
            SuppressSummonedTargetsEffectsWhileOnField = effectSpec.SuppressSummonedTargetsEffectsWhileOnField,
            KeywordModifications = effectSpec.KeywordModifications,
            ContextRules = effectSpec.ContextRules,
            TargetRules = new EffectTargetRuleSet
            {
                Operator = effectSpec.TargetRules.Operator,
                ExactTargetCount = null,
                MinimumTargetCount = null,
                MaximumTargetCount = null,
                TributeComposition = null,
                Rules = [],
            },
        };
    }
}
