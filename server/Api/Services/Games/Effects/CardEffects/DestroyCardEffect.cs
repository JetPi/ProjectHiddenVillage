using ErrorOr;
using Microsoft.Extensions.DependencyInjection;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class DestroyCardEffect(
    IGameRuntimeEffectSpecResolver effectSpecResolver,
    IGameEffectCanExecuteEvaluator canExecuteEvaluator,
    IGameEffectTargetResolver targetResolver,
    IServiceProvider? serviceProvider = null) : IGameCardEffect
{
    private readonly IGameRuntimeEffectSpecResolver effectSpecResolver = effectSpecResolver;
    private readonly IGameEffectCanExecuteEvaluator canExecuteEvaluator = canExecuteEvaluator;
    private readonly IGameEffectTargetResolver targetResolver = targetResolver;
    private readonly IServiceProvider? serviceProvider = serviceProvider;
    public const string EffectKey = "DestroyCard";

    public string EffectTypeKey => EffectKey;

    public CanExecuteResult CanExecute(GameCardEffectContext context)
    {
        var effectSpec = effectSpecResolver.Resolve(context, RuntimeEffects.DestroyCard);
        if (effectSpec is null)
        {
            return new CanExecuteResult
            {
                CanExecute = false,
                FailedConditions = ["DestroyCard effect is not defined on the source card."],
            };
        }

        return canExecuteEvaluator.Evaluate(context, effectSpec, includeValidTargets: true);
    }

    public IReadOnlyList<GameEffectTargetReference> GetValidTargets(GameCardEffectContext context)
    {
        var effectSpec = effectSpecResolver.Resolve(context, RuntimeEffects.DestroyCard);
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
        var affectedCardInstanceIds = new HashSet<string>(StringComparer.Ordinal);
        var affectedPlayerIds = new HashSet<string>(StringComparer.Ordinal)
        {
            context.ActingPlayer.Id,
        };

        foreach (var target in selectedTargets)
        {
            var sourceZone = target.Zone;
            var sourcePlayer = context.Game.State.Players.Find(player => player.PlayerId == target.PlayerId)!;

            var sourcePlayerZone = PlayerZoneCardAccessor.GetCards(sourceZone, sourcePlayer);
            var cardInstance = sourcePlayerZone.First(card => card.InstanceId == target.CardInstanceId);

            sourcePlayerZone.Remove(cardInstance);

            var ownerPlayer = context.Game.State.Players.Find(player => player.PlayerId == cardInstance.OwnerPlayerId)!;

            var ownerTrashZone = PlayerZoneCardAccessor.GetCards(PlayerZone.Trash, ownerPlayer);
            ownerTrashZone.Add(cardInstance);

            affectedCardInstanceIds.Add(cardInstance.InstanceId);
            affectedPlayerIds.Add(sourcePlayer.PlayerId);
            affectedPlayerIds.Add(ownerPlayer.PlayerId);
        }

        var mutationResult = EmitMutation(
            context,
            GameMutationKind.CardMovedZone,
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