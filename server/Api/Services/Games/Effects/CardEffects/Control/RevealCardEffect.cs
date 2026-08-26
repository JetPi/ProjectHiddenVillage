using ErrorOr;
using Microsoft.Extensions.DependencyInjection;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class RevealCardEffect(
    IGameRuntimeEffectSpecResolver effectSpecResolver,
    IGameEffectCanExecuteEvaluator canExecuteEvaluator,
    IGameEffectTargetResolver targetResolver,
    IServiceProvider? serviceProvider = null) : IGameCardEffect
{
    private readonly IGameRuntimeEffectSpecResolver effectSpecResolver = effectSpecResolver;
    private readonly IGameEffectCanExecuteEvaluator canExecuteEvaluator = canExecuteEvaluator;
    private readonly IGameEffectTargetResolver targetResolver = targetResolver;
    private readonly IServiceProvider? serviceProvider = serviceProvider;

    public const string EffectKey = "RevealCard";

    public string EffectTypeKey => EffectKey;

    public CanExecuteResult CanExecute(GameCardEffectContext context)
    {
        var effectSpec = effectSpecResolver.Resolve(context, RuntimeEffects.RevealCard);
        if (effectSpec is null)
        {
            return new CanExecuteResult
            {
                CanExecute = false,
                FailedConditions = ["RevealCard effect is not defined on the source card."],
            };
        }

        return canExecuteEvaluator.Evaluate(context, effectSpec, includeValidTargets: true);
    }

    public IReadOnlyList<GameEffectTargetReference> GetValidTargets(GameCardEffectContext context)
    {
        var effectSpec = effectSpecResolver.Resolve(context, RuntimeEffects.RevealCard);
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
        var affectedCardIds = new HashSet<string>(StringComparer.Ordinal);
        var affectedPlayerIds = new HashSet<string>(StringComparer.Ordinal)
        {
            context.ActingPlayer.Id,
        };

        foreach (var target in selectedTargets)
        {
            if (target.Zone == PlayerZone.Leader)
            {
                continue;
            }

            var targetPlayer = context.Game.State.Players.FirstOrDefault(player =>
                string.Equals(player.PlayerId, target.PlayerId, StringComparison.Ordinal));
            if (targetPlayer is null)
            {
                continue;
            }

            var zoneCards = PlayerZoneCardAccessor.GetCards(target.Zone, targetPlayer);
            var card = zoneCards.FirstOrDefault(entry =>
                string.Equals(entry.InstanceId, target.CardInstanceId, StringComparison.Ordinal));
            if (card is null)
            {
                continue;
            }

            card.IsRevealedToBothPlayers = true;
            card.RevealedInZone = target.Zone;
            affectedCardIds.Add(card.InstanceId);
            affectedPlayerIds.Add(targetPlayer.PlayerId);
        }

        if (affectedCardIds.Count == 0)
        {
            return Error.Validation(
                code: "Game.Effect.RevealCard.NoTargetsRevealed",
                description: "No selected targets could be revealed.");
        }

        // Keep argument handoff available for follow-up effect condition checks.
        if (context.Arguments is IDictionary<string, string> mutableArguments)
        {
            var orderedIds = selectedTargets
                .Select(target => target.CardInstanceId)
                .Where(id => affectedCardIds.Contains(id))
                .ToList();

            mutableArguments[ReactiveEffectExecutionConstants.RevealedTargetIdsArgument] = string.Join(",", orderedIds);
            mutableArguments[ReactiveEffectExecutionConstants.RevealedPrimaryTargetIdArgument] = orderedIds[0];
        }

        var mutationResult = EmitMutation(
            context,
            GameMutationKind.EffectResolved,
            affectedCardIds,
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
