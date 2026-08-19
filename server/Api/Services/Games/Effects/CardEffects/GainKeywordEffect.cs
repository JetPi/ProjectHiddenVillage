using ErrorOr;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class GainKeywordEffect(
	IGameRuntimeEffectSpecResolver effectSpecResolver,
	IGameEffectCanExecuteEvaluator canExecuteEvaluator,
	IGameEffectTargetResolver targetResolver) : IGameCardEffect
{
	private readonly IGameRuntimeEffectSpecResolver effectSpecResolver = effectSpecResolver;
	private readonly IGameEffectCanExecuteEvaluator canExecuteEvaluator = canExecuteEvaluator;
	private readonly IGameEffectTargetResolver targetResolver = targetResolver;

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

		foreach (var keywordModification in effectSpec.KeywordModifications)
		{
			var applyResult = ApplyKeywordModification(context, selectedTargets, keywordModification);
			if (applyResult.IsError)
			{
				return applyResult.Errors;
			}
		}

		return Result.Success;
	}

	private static bool RequiresTargetSelection(EffectSpec effectSpec)
	{
		return effectSpec.KeywordModifications.Any(modification =>
			modification.TargetType == KeywordModificationTargetType.SelectedTargets);
	}

	private static ErrorOr<Success> ApplyKeywordModification(
		GameCardEffectContext context,
		IReadOnlyList<GameEffectTargetReference> selectedTargets,
		KeywordModificationSpec modification)
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
			KeywordModificationTargetType.SourceCard => ApplyToSourceCard(context.SourceCardInstance, normalizedKeyword, modification.Operation),
			KeywordModificationTargetType.SelectedTargets => ApplyToSelectedTargets(context, selectedTargets, normalizedKeyword, modification.Operation),
			_ => Error.Validation(
				code: "Game.Effect.GainKeyword.UnsupportedTargetType",
				description: $"Unsupported keyword target type '{modification.TargetType}'.")
		};
	}

	private static ErrorOr<Success> ApplyToSourceCard(CardInstance? sourceCardInstance, string keyword, KeywordModificationOperation operation)
	{
		if (sourceCardInstance is null)
		{
			return Error.Validation(
				code: "Game.Effect.GainKeyword.SourceCardMissing",
				description: "Source card instance is required for source-card keyword modifications.");
		}

		ApplyKeywordOperation(sourceCardInstance.RuntimeKeywords, keyword, operation);
		return Result.Success;
	}

	private static ErrorOr<Success> ApplyToSelectedTargets(
		GameCardEffectContext context,
		IReadOnlyList<GameEffectTargetReference> selectedTargets,
		string keyword,
		KeywordModificationOperation operation)
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

			ApplyKeywordOperation(targetCard.RuntimeKeywords, keyword, operation);
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
