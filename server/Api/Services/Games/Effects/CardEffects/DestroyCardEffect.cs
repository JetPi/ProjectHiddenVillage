using ErrorOr;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class DestroyCardEffect : IGameCardEffect
{
    private readonly IGameRuntimeEffectSpecResolver effectSpecResolver;
    private readonly IGameEffectCanExecuteEvaluator canExecuteEvaluator;
    private readonly IGameEffectTargetResolver targetResolver;

    public DestroyCardEffect(
        IGameRuntimeEffectSpecResolver effectSpecResolver,
        IGameEffectCanExecuteEvaluator canExecuteEvaluator,
        IGameEffectTargetResolver targetResolver)
    {
        this.effectSpecResolver = effectSpecResolver;
        this.canExecuteEvaluator = canExecuteEvaluator;
        this.targetResolver = targetResolver;
    }

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
        }

        return Result.Success;
    }
}