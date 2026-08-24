using ErrorOr;
using Microsoft.Extensions.DependencyInjection;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class GainKeywordEffect(
	IGameRuntimeEffectSpecResolver effectSpecResolver,
	IGameEffectCanExecuteEvaluator canExecuteEvaluator,
	IGameEffectTargetResolver targetResolver,
	IServiceProvider? serviceProvider = null) : IGameCardEffect
{
	private readonly IGameRuntimeEffectSpecResolver effectSpecResolver = effectSpecResolver;
	private readonly IGameEffectCanExecuteEvaluator canExecuteEvaluator = canExecuteEvaluator;
	private readonly IGameEffectTargetResolver targetResolver = targetResolver;
	private readonly IServiceProvider? serviceProvider = serviceProvider;

	public const string EffectKey = "GainKeyword";

	public string EffectTypeKey => EffectKey;

	public CanExecuteResult CanExecute(GameCardEffectContext context)
	{
		var effectSpec = effectSpecResolver.Resolve(context, RuntimeEffects.GainEffect);
		if (effectSpec is null)
		{
			return new CanExecuteResult
			{
				CanExecute = false,
				FailedConditions = ["GainEffect is not defined on the source card."],
			};
		}

		if (effectSpec.KeywordModifications.Count == 0)
		{
			return new CanExecuteResult
			{
				CanExecute = false,
				FailedConditions = ["GainEffect requires at least one keyword modification."],
			};
		}

		var requiresTargetSelection = RequiresTargetSelection(effectSpec);
		return canExecuteEvaluator.Evaluate(context, effectSpec, includeValidTargets: requiresTargetSelection);
	}

	public IReadOnlyList<GameEffectTargetReference> GetValidTargets(GameCardEffectContext context)
	{
		var effectSpec = effectSpecResolver.Resolve(context, RuntimeEffects.GainEffect);
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
		var effectSpec = effectSpecResolver.Resolve(context, RuntimeEffects.GainEffect)!;
		var affectedCardInstanceIds = new HashSet<string>(StringComparer.Ordinal);
		var affectedPlayerIds = new HashSet<string>(StringComparer.Ordinal)
		{
			context.ActingPlayer.Id,
		};

		foreach (var keywordModification in effectSpec.KeywordModifications)
		{
			if (keywordModification.TargetType == KeywordModificationTargetType.SourceCard
				&& context.SourceCardInstance is not null)
			{
				affectedCardInstanceIds.Add(context.SourceCardInstance.InstanceId);
				affectedPlayerIds.Add(context.SourceCardInstance.ControllerPlayerId);
			}

			if (keywordModification.TargetType == KeywordModificationTargetType.SelectedTargets)
			{
				foreach (var target in selectedTargets.Where(target => !target.IsEffectResolutionStackTarget))
				{
					affectedCardInstanceIds.Add(target.CardInstanceId);
					affectedPlayerIds.Add(target.PlayerId);
				}
			}

			var applyResult = ApplyKeywordModification(context, selectedTargets, keywordModification, effectSpec);
			if (applyResult.IsError)
			{
				return applyResult.Errors;
			}
		}

		if (affectedCardInstanceIds.Count > 0)
		{
			var mutationResult = EmitMutation(
				context,
				GameMutationKind.KeywordChanged,
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

	private static bool RequiresTargetSelection(EffectSpec effectSpec)
	{
		return effectSpec.KeywordModifications.Any(modification =>
			modification.TargetType == KeywordModificationTargetType.SelectedTargets);
	}

	private static ErrorOr<Success> ApplyKeywordModification(
		GameCardEffectContext context,
		IReadOnlyList<GameEffectTargetReference> selectedTargets,
		KeywordModificationSpec modification,
		EffectSpec effectSpec)
	{
		if (string.IsNullOrWhiteSpace(modification.Keyword))
		{
			return Error.Validation(
				code: "Game.Effect.GainKeyword.EmptyKeyword",
				description: "Keyword modification must provide a non-empty keyword.");
		}

		var normalizedKeyword = modification.Keyword.Trim();

		return modification.TargetType switch
		{
			KeywordModificationTargetType.SourceCard => ApplyToSourceCard(context, context.SourceCardInstance, normalizedKeyword, modification, effectSpec),
			KeywordModificationTargetType.SelectedTargets => ApplyToSelectedTargets(context, selectedTargets, normalizedKeyword, modification, effectSpec),
			_ => Error.Validation(
				code: "Game.Effect.GainKeyword.UnsupportedTargetType",
				description: $"Unsupported keyword target type '{modification.TargetType}'.")
		};
	}

	private static ErrorOr<Success> ApplyToSourceCard(
		GameCardEffectContext context,
		CardInstance? sourceCardInstance,
		string keyword,
		KeywordModificationSpec modification,
		EffectSpec effectSpec)
	{
		if (sourceCardInstance is null)
		{
			return Error.Validation(
				code: "Game.Effect.GainKeyword.SourceCardMissing",
				description: "Source card instance is required for source-card keyword modifications.");
		}

		if (CardRuntimeEffectStateService.IsDurationSupportedForKeywords(effectSpec.DurationMode)
			&& context.SourceCardInstance is not null)
		{
			CardRuntimeEffectStateService.AddTemporaryKeywordEffect(
				context.Game.State,
				context.SourceCardInstance,
				sourceCardInstance,
				effectSpec.Id,
				modification,
				effectSpec.DurationMode);
			return Result.Success;
		}

		ApplyKeywordOperation(sourceCardInstance.RuntimeKeywords, keyword, modification.Operation);
		return Result.Success;
	}

	private static ErrorOr<Success> ApplyToSelectedTargets(
		GameCardEffectContext context,
		IReadOnlyList<GameEffectTargetReference> selectedTargets,
		string keyword,
		KeywordModificationSpec modification,
		EffectSpec effectSpec)
	{
		foreach (var target in selectedTargets.Where(target => !target.IsEffectResolutionStackTarget))
		{
			var targetPlayer = context.Game.State.Players.FirstOrDefault(player =>
				string.Equals(player.PlayerId, target.PlayerId, StringComparison.Ordinal));

			if (targetPlayer is null)
			{
				return Error.NotFound(
					code: "Game.Effect.GainKeyword.TargetPlayerNotFound",
					description: $"Target player '{target.PlayerId}' was not found.");
			}

			var targetZone = PlayerZoneCardAccessor.GetCards(target.Zone, targetPlayer);
			var targetCard = targetZone.FirstOrDefault(card =>
				string.Equals(card.InstanceId, target.CardInstanceId, StringComparison.Ordinal));

			if (targetCard is null)
			{
				return Error.NotFound(
					code: "Game.Effect.GainKeyword.TargetCardNotFound",
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
					modification,
					effectSpec.DurationMode);
				continue;
			}

			ApplyKeywordOperation(targetCard.RuntimeKeywords, keyword, modification.Operation);
		}

		return Result.Success;
	}

	private static void ApplyKeywordOperation(List<string> runtimeKeywords, string keyword, KeywordModificationOperation operation)
	{
		if (operation == KeywordModificationOperation.Remove)
		{
			runtimeKeywords.RemoveAll(existing => string.Equals(existing, keyword, StringComparison.OrdinalIgnoreCase));
			return;
		}

		if (!runtimeKeywords.Any(existing => string.Equals(existing, keyword, StringComparison.OrdinalIgnoreCase)))
		{
			runtimeKeywords.Add(keyword);
		}
	}
}
