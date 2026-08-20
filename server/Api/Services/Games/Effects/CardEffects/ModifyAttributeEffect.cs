using ErrorOr;
using Microsoft.Extensions.DependencyInjection;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class ModifyAttributeEffect(
    IGameRuntimeEffectSpecResolver effectSpecResolver,
    IGameEffectCanExecuteEvaluator canExecuteEvaluator,
    IGameEffectTargetResolver targetResolver,
    IServiceProvider? serviceProvider = null) : IGameCardEffect
{
    private readonly IGameRuntimeEffectSpecResolver effectSpecResolver = effectSpecResolver;
    private readonly IGameEffectCanExecuteEvaluator canExecuteEvaluator = canExecuteEvaluator;
    private readonly IGameEffectTargetResolver targetResolver = targetResolver;
    private readonly IServiceProvider? serviceProvider = serviceProvider;

    public const string EffectKey = "ChangeValues";

    public string EffectTypeKey => EffectKey;

    public CanExecuteResult CanExecute(GameCardEffectContext context)
    {
        var effectSpec = effectSpecResolver.Resolve(context, RuntimeEffects.ChangeValues);
        if (effectSpec is null)
        {
            return new CanExecuteResult
            {
                CanExecute = false,
                FailedConditions = ["ChangeValues effect is not defined on the source card."],
            };
        }

        if (effectSpec.AttributeModifications.Count == 0)
        {
            return new CanExecuteResult
            {
                CanExecute = false,
                FailedConditions = ["ChangeValues requires at least one attribute modification."],
            };
        }

        var requiresTargetSelection = RequiresTargetSelection(effectSpec);
        return canExecuteEvaluator.Evaluate(context, effectSpec, includeValidTargets: requiresTargetSelection);
    }

    public IReadOnlyList<GameEffectTargetReference> GetValidTargets(GameCardEffectContext context)
    {
        var effectSpec = effectSpecResolver.Resolve(context, RuntimeEffects.ChangeValues);
        if (effectSpec is null || !RequiresTargetSelection(effectSpec))
        {
            return [];
        }

        var canExecuteResult = canExecuteEvaluator.Evaluate(context, effectSpec, includeValidTargets: false);
        if (!canExecuteResult.CanExecute)
        {
            return [];
        }

        return targetResolver.ResolveTargets(context, effectSpec);
    }

    public ErrorOr<Success> Execute(GameCardEffectContext context, IReadOnlyList<GameEffectTargetReference> selectedTargets)
    {
        var effectSpec = effectSpecResolver.Resolve(context, RuntimeEffects.ChangeValues)!;
        var affectsCards = false;
        var affectsLeaders = false;

        if (RequiresTargetSelection(effectSpec) && selectedTargets.Count == 0)
        {
            return Error.Validation(
                code: "Game.Effect.ChangeValues.MissingTargets",
                description: "This ChangeValues effect requires selected targets.");
        }

        foreach (var modification in effectSpec.AttributeModifications)
        {
            affectsCards |= modification.TargetType == AttributeModificationTargetType.SelectedTargets;
            affectsLeaders |= modification.TargetType == AttributeModificationTargetType.Leader;

            var applyResult = ApplyModification(context, selectedTargets, modification);
            if (applyResult.IsError)
            {
                return applyResult.Errors;
            }
        }

        var affectedCardInstanceIds = selectedTargets
            .Where(target => !target.IsEffectResolutionStackTarget)
            .Select(target => target.CardInstanceId)
            .Where(cardInstanceId => !string.IsNullOrWhiteSpace(cardInstanceId))
            .Distinct(StringComparer.Ordinal)
            .ToList();

        var affectedPlayerIds = new HashSet<string>(StringComparer.Ordinal)
        {
            context.ActingPlayer.Id,
        };

        foreach (var targetPlayerId in selectedTargets
            .Where(target => !target.IsEffectResolutionStackTarget)
            .Select(target => target.PlayerId)
            .Where(playerId => !string.IsNullOrWhiteSpace(playerId)))
        {
            affectedPlayerIds.Add(targetPlayerId);
        }

        if (affectsLeaders)
        {
            foreach (var playerId in ResolveAffectedLeaderPlayerIds(context, effectSpec))
            {
                affectedPlayerIds.Add(playerId);
            }
        }

        if (affectsCards || affectsLeaders)
        {
            var mutationKind = affectsCards
                ? GameMutationKind.CardStatChanged
                : GameMutationKind.LeaderStatChanged;

            var mutationResult = EmitMutation(
                context,
                mutationKind,
                affectedCardInstanceIds,
                affectedPlayerIds);

            if (mutationResult.IsError)
            {
                return mutationResult.Errors;
            }
        }

        return Result.Success;
    }

    private ErrorOr<Success> EmitMutation(
        GameCardEffectContext context,
        GameMutationKind mutationKind,
        IReadOnlyCollection<string> affectedCardInstanceIds,
        IReadOnlyCollection<string> affectedPlayerIds)
    {
        if (context.Arguments.TryGetValue(ReactiveEffectExecutionConstants.SkipReactiveOrchestrationArgument, out var skipValue)
            && bool.TryParse(skipValue, out var shouldSkip)
            && shouldSkip)
        {
            return Result.Success;
        }

        var reactiveEffectOrchestrator = serviceProvider?.GetService<IGameReactiveEffectOrchestrator>();
        if (reactiveEffectOrchestrator is null)
        {
            return Result.Success;
        }

        var mutationEvent = new GameMutationEvent
        {
            Kind = mutationKind,
            GameId = context.Game.State.GameId,
            ActingPlayerId = context.ActingPlayer.Id,
            TurnNumber = context.Game.State.TurnNumber,
            Phase = context.Game.State.Phase,
            AffectedCardInstanceIds = affectedCardInstanceIds.ToList(),
            AffectedPlayerIds = affectedPlayerIds.ToList(),
        };

        var orchestrationResult = reactiveEffectOrchestrator.ApplyPostMutationEffects(context.Game, mutationEvent, context.ActingPlayer.Id);
        return orchestrationResult.IsError ? orchestrationResult.Errors : Result.Success;
    }

    private static IReadOnlyList<string> ResolveAffectedLeaderPlayerIds(GameCardEffectContext context, EffectSpec effectSpec)
    {
        var playerIds = new HashSet<string>(StringComparer.Ordinal);

        foreach (var modification in effectSpec.AttributeModifications)
        {
            if (modification.TargetType != AttributeModificationTargetType.Leader)
            {
                continue;
            }

            var targetLeaders = ResolveLeaderTargets(context, modification.TargetRange);
            foreach (var leader in targetLeaders)
            {
                if (!string.IsNullOrWhiteSpace(leader.ControllerPlayerId))
                {
                    playerIds.Add(leader.ControllerPlayerId);
                }
            }
        }

        return playerIds.ToList();
    }

    private static bool RequiresTargetSelection(EffectSpec effectSpec)
    {
        return effectSpec.AttributeModifications.Any(modification =>
            modification.TargetType == AttributeModificationTargetType.SelectedTargets);
    }

    private static ErrorOr<Success> ApplyModification(
        GameCardEffectContext context,
        IReadOnlyList<GameEffectTargetReference> selectedTargets,
        AttributeModificationSpec modification)
    {
        return modification.TargetType switch
        {
            AttributeModificationTargetType.SelectedTargets => ApplyToSelectedTargets(context, selectedTargets, modification),
            AttributeModificationTargetType.Leader => ApplyToLeaders(context, modification),
            _ => Error.Validation(
                code: "Game.Effect.ChangeValues.UnsupportedTargetType",
                description: $"Unsupported target type '{modification.TargetType}'.")
        };
    }

    private static ErrorOr<Success> ApplyToSelectedTargets(
        GameCardEffectContext context,
        IReadOnlyList<GameEffectTargetReference> selectedTargets,
        AttributeModificationSpec modification)
    {
        foreach (var target in selectedTargets.Where(target => !target.IsEffectResolutionStackTarget))
        {
            var targetPlayer = context.Game.State.Players.FirstOrDefault(player =>
                string.Equals(player.PlayerId, target.PlayerId, StringComparison.Ordinal));

            if (targetPlayer is null)
            {
                return Error.NotFound(
                    code: "Game.Effect.ChangeValues.TargetPlayerNotFound",
                    description: $"Target player '{target.PlayerId}' was not found.");
            }

            var sourceZone = PlayerZoneCardAccessor.GetCards(target.Zone, targetPlayer);
            var targetCard = sourceZone.FirstOrDefault(card =>
                string.Equals(card.InstanceId, target.CardInstanceId, StringComparison.Ordinal));

            if (targetCard is null)
            {
                return Error.NotFound(
                    code: "Game.Effect.ChangeValues.TargetCardNotFound",
                    description: $"Target card instance '{target.CardInstanceId}' was not found in {target.Zone}.");
            }

            if (!context.Game.State.CardDefinitions.TryGetValue(targetCard.CardDefinitionId, out var definition))
            {
                return Error.NotFound(
                    code: "Game.Effect.ChangeValues.CardDefinitionNotFound",
                    description: $"Card definition '{targetCard.CardDefinitionId}' was not found.");
            }

            switch (modification.Attribute)
            {
                case EffectAttributeType.CardPower:
                    {
                        var currentValue = targetCard.PowerOverride ?? definition.Power;
                        var updatedValue = ApplyOperation(currentValue, modification.Operation, modification.Value);
                        targetCard.PowerOverride = Clamp(updatedValue, modification, defaultMin: 0);
                        break;
                    }

                case EffectAttributeType.CardDamage:
                    {
                        var currentValue = targetCard.DamageOverride ?? definition.Damage;
                        var updatedValue = ApplyOperation(currentValue, modification.Operation, modification.Value);
                        targetCard.DamageOverride = Clamp(updatedValue, modification, defaultMin: 0);
                        break;
                    }

                case EffectAttributeType.CardHealth:
                    {
                        var baseHealth = definition is CharacterCard characterDefinition
                            ? characterDefinition.Health
                            : 0;

                        var currentValue = targetCard.HealthOverride ?? baseHealth;
                        var updatedValue = ApplyOperation(currentValue, modification.Operation, modification.Value);
                        targetCard.HealthOverride = Clamp(updatedValue, modification, defaultMin: 0);
                        break;
                    }

                default:
                    return Error.Validation(
                        code: "Game.Effect.ChangeValues.InvalidSelectedTargetAttribute",
                        description: $"Attribute '{modification.Attribute}' cannot be applied to selected card targets.");
            }
        }

        return Result.Success;
    }

    private static ErrorOr<Success> ApplyToLeaders(
        GameCardEffectContext context,
        AttributeModificationSpec modification)
    {
        if (modification.Attribute == EffectAttributeType.CardPower)
        {
            return Error.Validation(
                code: "Game.Effect.ChangeValues.InvalidLeaderAttribute",
                description: "CardPower cannot be applied to leader targets.");
        }

        var targetLeaders = ResolveLeaderTargets(context, modification.TargetRange);

        foreach (var leader in targetLeaders)
        {
            switch (modification.Attribute)
            {
                case EffectAttributeType.LeaderDamage:
                    {
                        var updatedDamage = ApplyOperation(leader.Damage, modification.Operation, modification.Value);
                        leader.Damage = Clamp(updatedDamage, modification, defaultMin: 0);
                        break;
                    }

                case EffectAttributeType.LeaderPower:
                    {
                        var updatedPower = ApplyOperation(leader.Power, modification.Operation, modification.Value);
                        leader.Power = Clamp(updatedPower, modification, defaultMin: 0);
                        break;
                    }

                case EffectAttributeType.LeaderCurrentLife:
                    {
                        var updatedCurrentLife = ApplyOperation(leader.CurrentLife, modification.Operation, modification.Value);
                        var clampedCurrentLife = Clamp(updatedCurrentLife, modification, defaultMin: 0);
                        leader.CurrentLife = clampedCurrentLife;
                        break;
                    }

                default:
                    return Error.Validation(
                        code: "Game.Effect.ChangeValues.UnsupportedLeaderAttribute",
                        description: $"Unsupported leader attribute '{modification.Attribute}'.");
            }
        }

        return Result.Success;
    }

    private static IReadOnlyList<LeaderCardInstanceState> ResolveLeaderTargets(GameCardEffectContext context, EffectTargetRange scope)
    {
        var actingPlayer = context.Game.State.Players.FirstOrDefault(player =>
            string.Equals(player.PlayerId, context.ActingPlayer.Id, StringComparison.Ordinal));

        if (actingPlayer is null)
        {
            return [];
        }

        return scope switch
        {
            EffectTargetRange.Self => actingPlayer.LeaderCardInstance is null ? [] : [actingPlayer.LeaderCardInstance],
            EffectTargetRange.Opponent => context.Game.State.Players
                .Where(player => !string.Equals(player.PlayerId, actingPlayer.PlayerId, StringComparison.Ordinal))
                .Select(player => player.LeaderCardInstance)
                .Where(leader => leader is not null)
                .Cast<LeaderCardInstanceState>()
                .ToList(),
            EffectTargetRange.Any => context.Game.State.Players
                .Select(player => player.LeaderCardInstance)
                .Where(leader => leader is not null)
                .Cast<LeaderCardInstanceState>()
                .ToList(),
            _ => []
        };
    }

    private static int ApplyOperation(int currentValue, AttributeModificationOperation operation, int operand)
    {
        return operation switch
        {
            AttributeModificationOperation.Add => currentValue + operand,
            AttributeModificationOperation.Subtract => currentValue - operand,
            AttributeModificationOperation.Multiply => currentValue * operand,
            AttributeModificationOperation.Set => operand,
            _ => currentValue
        };
    }

    private static int Clamp(int value, AttributeModificationSpec modification, int defaultMin)
    {
        var min = modification.MinimumValue ?? defaultMin;
        var max = modification.MaximumValue;
        var clamped = Math.Max(min, value);
        return max.HasValue ? Math.Min(clamped, max.Value) : clamped;
    }
}
