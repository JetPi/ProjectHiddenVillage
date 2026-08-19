using ErrorOr;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class NegateCardEffect(
	IGameRuntimeEffectSpecResolver effectSpecResolver,
	IGameEffectCanExecuteEvaluator canExecuteEvaluator,
	IGameValidTargetResultFactory validTargetResultFactory) : IGameCardEffect
{
	private readonly IGameRuntimeEffectSpecResolver effectSpecResolver = effectSpecResolver;
	private readonly IGameEffectCanExecuteEvaluator canExecuteEvaluator = canExecuteEvaluator;
	private readonly IGameValidTargetResultFactory validTargetResultFactory = validTargetResultFactory;

	public const string EffectKey = "NegateEffect";

	public string EffectTypeKey => EffectKey;

	public CanExecuteResult CanExecute(GameCardEffectContext context)
	{
		var effectSpec = effectSpecResolver.Resolve(context, RuntimeEffects.NegateEffect);
		if (effectSpec is null)
		{
			return new CanExecuteResult
			{
				CanExecute = false,
				FailedConditions = ["NegateEffect is not defined on the source card."],
			};
		}

		var canExecuteResult = canExecuteEvaluator.Evaluate(context, effectSpec, includeValidTargets: false);
		if (!canExecuteResult.CanExecute)
		{
			return canExecuteResult;
		}

		var stackTargets = BuildActiveStackTargets(context.Game.State);
		if (stackTargets.Count == 0)
		{
			canExecuteResult.CanExecute = false;
			canExecuteResult.FailedConditions.Add("No active effects are available on the resolution stack to negate.");
			return canExecuteResult;
		}

		canExecuteResult.ValidTargets.AddRange(stackTargets.Select(target =>
			validTargetResultFactory.Create(target, context.Game.State)));
		return canExecuteResult;
	}

	public IReadOnlyList<GameEffectTargetReference> GetValidTargets(GameCardEffectContext context)
	{
		var effectSpec = effectSpecResolver.Resolve(context, RuntimeEffects.NegateEffect);
		if (effectSpec is null)
		{
			return [];
		}

		var canExecuteResult = canExecuteEvaluator.Evaluate(context, effectSpec, includeValidTargets: false);
		if (!canExecuteResult.CanExecute)
		{
			return [];
		}

		return BuildActiveStackTargets(context.Game.State);
	}

	public ErrorOr<Success> Execute(GameCardEffectContext context, IReadOnlyList<GameEffectTargetReference> selectedTargets)
	{
		var stackTarget = selectedTargets.FirstOrDefault(target => target.IsEffectResolutionStackTarget);
		if (stackTarget is null)
		{
			return Error.Validation(
				code: "Game.Effect.NegateEffect.MissingStackTarget",
				description: "A resolution-stack target must be selected for NegateEffect.");
		}

		if (string.IsNullOrWhiteSpace(stackTarget.EffectResolutionEntryId))
		{
			return Error.Validation(
				code: "Game.Effect.NegateEffect.MissingStackEntryId",
				description: "The selected stack target is missing EffectResolutionEntryId.");
		}

		var stackEntry = context.Game.State.EffectResolutionStack
			.FirstOrDefault(entry => string.Equals(entry.EntryId, stackTarget.EffectResolutionEntryId, StringComparison.Ordinal));

		if (stackEntry is null)
		{
			return Error.NotFound(
				code: "Game.Effect.NegateEffect.StackEntryNotFound",
				description: $"Stack entry '{stackTarget.EffectResolutionEntryId}' was not found.");
		}

		stackEntry.IsNegated = true;
		return Result.Success;
	}

	private static IReadOnlyList<GameEffectTargetReference> BuildActiveStackTargets(GameState gameState)
	{
		return gameState.EffectResolutionStack
			.Where(entry => !entry.IsNegated)
			.Select(entry => new GameEffectTargetReference(
				PlayerId: entry.SourcePlayerId,
				Zone: entry.SourceZone,
				CardInstanceId: entry.SourceCardInstanceId,
				IsEffectResolutionStackTarget: true,
				EffectResolutionEntryId: entry.EntryId))
			.ToList();
	}
}
