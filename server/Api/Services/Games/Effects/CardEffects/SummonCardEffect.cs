using ErrorOr;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class SummonCardEffect(
	IGameRuntimeEffectSpecResolver effectSpecResolver,
	IGameEffectCanExecuteEvaluator canExecuteEvaluator,
	IGameEffectTargetResolver targetResolver) : IGameCardEffect
{
	private readonly IGameRuntimeEffectSpecResolver effectSpecResolver = effectSpecResolver;
	private readonly IGameEffectCanExecuteEvaluator canExecuteEvaluator = canExecuteEvaluator;
	private readonly IGameEffectTargetResolver targetResolver = targetResolver;

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

		foreach (var target in selectedTargets)
		{
			var sourcePlayer = context.Game.State.Players.First(player => player.PlayerId == target.PlayerId);
			var sourceZone = PlayerZoneCardAccessor.GetCards(target.Zone, sourcePlayer);
			var cardInstance = sourceZone.First(card => card.InstanceId == target.CardInstanceId);

			sourceZone.Remove(cardInstance);
			cardInstance.ControllerPlayerId = summoningPlayer.PlayerId;
			cardInstance.EnteredFieldTurnNumber = context.Game.State.TurnNumber;
			summoningPlayerField.Add(cardInstance);
		}

		return Result.Success;
	}
}
