using ErrorOr;
using Microsoft.Extensions.DependencyInjection;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class FreezeCardEffect(
    IGameRuntimeEffectSpecResolver effectSpecResolver,
    IGameEffectCanExecuteEvaluator canExecuteEvaluator,
    IGameEffectTargetResolver targetResolver,
    IServiceProvider? serviceProvider = null) : IGameCardEffect
{
    private readonly IGameRuntimeEffectSpecResolver effectSpecResolver = effectSpecResolver;
    private readonly IGameEffectCanExecuteEvaluator canExecuteEvaluator = canExecuteEvaluator;
    private readonly IGameEffectTargetResolver targetResolver = targetResolver;
    private readonly IServiceProvider? serviceProvider = serviceProvider;

    public const string EffectKey = "FreezeCard";
    public const string CannotAttackKeyword = "Cannot Attack";

    public string EffectTypeKey => EffectKey;

    public CanExecuteResult CanExecute(GameCardEffectContext context)
    {
        var effectSpec = effectSpecResolver.Resolve(context, RuntimeEffects.FreezeCard);
        if (effectSpec is null)
        {
            return new CanExecuteResult
            {
                CanExecute = false,
                FailedConditions = ["FreezeCard effect is not defined on the source card."],
            };
        }

        return canExecuteEvaluator.Evaluate(context, effectSpec, includeValidTargets: true);
    }

    public IReadOnlyList<GameEffectTargetReference> GetValidTargets(GameCardEffectContext context)
    {
        var effectSpec = effectSpecResolver.Resolve(context, RuntimeEffects.FreezeCard);
        if (effectSpec is null)
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
        var effectSpec = effectSpecResolver.Resolve(context, RuntimeEffects.FreezeCard);
        if (effectSpec is null)
        {
            return Error.Validation(
                code: "Game.Effect.FreezeCard.MissingEffectSpec",
                description: "FreezeCard effect is not defined on the source card.");
        }

        if (selectedTargets.Count == 0)
        {
            return Error.Validation(
                code: "Game.Effect.FreezeCard.MissingTargets",
                description: "FreezeCard requires at least one selected target.");
        }

        var affectedCardInstanceIds = new HashSet<string>(StringComparer.Ordinal);
        var affectedPlayerIds = new HashSet<string>(StringComparer.Ordinal)
        {
            context.ActingPlayer.Id,
        };

        foreach (var target in selectedTargets.Where(target => !target.IsEffectResolutionStackTarget))
        {
            if (target.Zone == PlayerZone.Leader)
            {
                continue;
            }

            var targetPlayer = context.Game.State.Players.FirstOrDefault(player =>
                string.Equals(player.PlayerId, target.PlayerId, StringComparison.Ordinal));

            if (targetPlayer is null)
            {
                return Error.NotFound(
                    code: "Game.Effect.FreezeCard.TargetPlayerNotFound",
                    description: $"Target player '{target.PlayerId}' was not found.");
            }

            var sourceZone = PlayerZoneCardAccessor.GetCards(target.Zone, targetPlayer);
            var targetCard = sourceZone.FirstOrDefault(card =>
                string.Equals(card.InstanceId, target.CardInstanceId, StringComparison.Ordinal));

            if (targetCard is null)
            {
                return Error.NotFound(
                    code: "Game.Effect.FreezeCard.TargetCardNotFound",
                    description: $"Target card instance '{target.CardInstanceId}' was not found in {target.Zone}.");
            }

            if (CardRuntimeEffectStateService.IsDurationSupportedForKeywords(effectSpec.DurationMode)
                && context.SourceCardInstance is not null)
            {
                CardRuntimeEffectStateService.AddTemporaryKeywordEffect(
                    context.Game.State,
                    context.SourceCardInstance,
                    targetCard,
                    effectSpec.Id,
                    new KeywordModificationSpec
                    {
                        TargetType = KeywordModificationTargetType.SelectedTargets,
                        Operation = KeywordModificationOperation.Add,
                        Keyword = CannotAttackKeyword,
                    },
                    effectSpec.DurationMode);
            }
            else if (!targetCard.RuntimeKeywords.Any(keyword =>
                string.Equals(keyword, CannotAttackKeyword, StringComparison.OrdinalIgnoreCase)))
            {
                targetCard.RuntimeKeywords.Add(CannotAttackKeyword);
            }

            affectedCardInstanceIds.Add(targetCard.InstanceId);
            affectedPlayerIds.Add(targetPlayer.PlayerId);
        }

        if (affectedCardInstanceIds.Count == 0)
        {
            return Error.Validation(
                code: "Game.Effect.FreezeCard.NoTargetsAffected",
                description: "FreezeCard did not affect any selected targets.");
        }

        var mutationResult = EmitMutation(
            context,
            GameMutationKind.KeywordChanged,
            affectedCardInstanceIds,
            affectedPlayerIds);

        if (mutationResult.IsError)
        {
            return mutationResult.Errors;
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
}