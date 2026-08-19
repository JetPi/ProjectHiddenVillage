using ErrorOr;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class SummonCardEffect(
	IGameRuntimeEffectSpecResolver effectSpecResolver,
	IGameEffectCanExecuteEvaluator canExecuteEvaluator,
	IGameEffectTargetResolver targetResolver,
	IGameReactiveEffectOrchestrator? reactiveEffectOrchestrator = null) : IGameCardEffect
{
	private readonly IGameRuntimeEffectSpecResolver effectSpecResolver = effectSpecResolver;
	private readonly IGameEffectCanExecuteEvaluator canExecuteEvaluator = canExecuteEvaluator;
	private readonly IGameEffectTargetResolver targetResolver = targetResolver;
	private readonly IGameReactiveEffectOrchestrator? reactiveEffectOrchestrator = reactiveEffectOrchestrator;

	public const string EffectKey = "SummonCard";

	public string EffectTypeKey => EffectKey;

	public CanExecuteResult CanExecute(GameCardEffectContext context)
	{
		var effectSpec = effectSpecResolver.Resolve(context, RuntimeEffects.SummonCard);
		if (effectSpec is null)
		{
			return new CanExecuteResult
			{
				CanExecute = false,
				FailedConditions = ["SummonCard effect is not defined on the source card."],
			};
		}

		return canExecuteEvaluator.Evaluate(context, effectSpec, includeValidTargets: true);
	}

	public IReadOnlyList<GameEffectTargetReference> GetValidTargets(GameCardEffectContext context)
	{
		var effectSpec = effectSpecResolver.Resolve(context, RuntimeEffects.SummonCard);
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
		var summoningPlayer = context.Game.State.Players.First(player => player.PlayerId == context.ActingPlayer.Id);
		var summoningPlayerField = PlayerZoneCardAccessor.GetCards(PlayerZone.CharacterField, summoningPlayer);
		var affectedCardInstanceIds = new HashSet<string>(StringComparer.Ordinal);
		var affectedPlayerIds = new HashSet<string>(StringComparer.Ordinal)
		{
			summoningPlayer.PlayerId,
		};

		foreach (var target in selectedTargets)
		{
			var sourcePlayer = context.Game.State.Players.First(player => player.PlayerId == target.PlayerId);
			var sourceZone = PlayerZoneCardAccessor.GetCards(target.Zone, sourcePlayer);
			var cardInstance = sourceZone.First(card => card.InstanceId == target.CardInstanceId);

			sourceZone.Remove(cardInstance);
			cardInstance.ControllerPlayerId = summoningPlayer.PlayerId;
			cardInstance.EnteredFieldTurnNumber = context.Game.State.TurnNumber;
			summoningPlayerField.Add(cardInstance);

			affectedCardInstanceIds.Add(cardInstance.InstanceId);
			affectedPlayerIds.Add(sourcePlayer.PlayerId);
		}

		var mutationResult = EmitMutation(
			context,
			GameMutationKind.CardSummoned,
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
