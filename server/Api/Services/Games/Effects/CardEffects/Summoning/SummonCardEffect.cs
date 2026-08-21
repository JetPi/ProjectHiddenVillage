using ErrorOr;
using Microsoft.Extensions.DependencyInjection;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class SummonCardEffect(
	IGameRuntimeEffectSpecResolver effectSpecResolver,
	IGameEffectCanExecuteEvaluator canExecuteEvaluator,
	IGameEffectTargetResolver targetResolver,
	IServiceProvider? serviceProvider = null) : IGameCardEffect
{
	private readonly IGameRuntimeEffectSpecResolver effectSpecResolver = effectSpecResolver;
	private readonly IGameEffectCanExecuteEvaluator canExecuteEvaluator = canExecuteEvaluator;
	private readonly IGameEffectTargetResolver targetResolver = targetResolver;
	private readonly IServiceProvider? serviceProvider = serviceProvider;

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

		var result = canExecuteEvaluator.Evaluate(context, effectSpec, includeValidTargets: true);
		if (!result.CanExecute)
		{
			return result;
		}

		result.ValidTargets = result.ValidTargets
			.Where(target => !IsNormalSummonBlocked(context, target.CardInstanceId))
			.ToList();

		if (result.ValidTargets.Count == 0)
		{
			result.CanExecute = false;
			result.FailedConditions.Add("No valid summon targets. One or more cards cannot be summoned normally.");
		}

		return result;
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

		return targetResolver
			.ResolveTargets(context, effectSpec)
			.Where(target => !IsNormalSummonBlocked(context, target.CardInstanceId))
			.ToList();
	}

	public ErrorOr<Success> Execute(GameCardEffectContext context, IReadOnlyList<GameEffectTargetReference> selectedTargets)
	{
		var effectSpec = effectSpecResolver.Resolve(context, RuntimeEffects.SummonCard);
		var suppressSummonedTargetsEffectsWhileOnField =
			effectSpec?.SuppressSummonedTargetsEffectsWhileOnField ?? false;

		var blockedTarget = selectedTargets.FirstOrDefault(target => IsNormalSummonBlocked(context, target.CardInstanceId));
		if (blockedTarget is not null)
		{
			return Error.Validation(
				code: "Game.Effect.SummonCard.CannotBeNormalSummoned",
				description: $"Card '{blockedTarget.CardInstanceId}' cannot be summoned normally.");
		}

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
			cardInstance.EffectsSuppressedWhileOnField = suppressSummonedTargetsEffectsWhileOnField;
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

	private static bool IsNormalSummonBlocked(GameCardEffectContext context, string cardInstanceId)
	{
		var cardInstance = context.Game.State.Players
			.SelectMany(player => player.Deck
				.Concat(player.Hand)
				.Concat(player.Battlefield)
				.Concat(player.SupportZone)
				.Concat(player.DiscardPile)
				.Concat(player.ExileZone))
			.FirstOrDefault(card => string.Equals(card.InstanceId, cardInstanceId, StringComparison.Ordinal));

		if (cardInstance is null)
		{
			return false;
		}

		if (!context.Game.State.CardDefinitions.TryGetValue(cardInstance.CardDefinitionId, out var cardDefinition))
		{
			return false;
		}

		return cardDefinition.CannotBeNormalSummoned;
	}
}
