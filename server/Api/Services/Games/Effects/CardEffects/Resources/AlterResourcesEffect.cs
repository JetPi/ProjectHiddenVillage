using ErrorOr;
using Microsoft.Extensions.DependencyInjection;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class AlterResourcesEffect(
	IGameRuntimeEffectSpecResolver effectSpecResolver,
	IGameEffectCanExecuteEvaluator canExecuteEvaluator,
	IServiceProvider? serviceProvider = null) : IGameCardEffect
{
	private readonly IGameRuntimeEffectSpecResolver effectSpecResolver = effectSpecResolver;
	private readonly IGameEffectCanExecuteEvaluator canExecuteEvaluator = canExecuteEvaluator;
	private readonly IServiceProvider? serviceProvider = serviceProvider;

	public const string EffectKey = "AlterResources";

	public string EffectTypeKey => EffectKey;

	public CanExecuteResult CanExecute(GameCardEffectContext context)
	{
		var effectSpec = effectSpecResolver.Resolve(context, RuntimeEffects.AlterResources);
		if (effectSpec is null)
		{
			return new CanExecuteResult
			{
				CanExecute = false,
				FailedConditions = ["AlterResources effect is not defined on the source card."],
			};
		}

		if (effectSpec.ChakraAdjustments.Count == 0
			&& effectSpec.SummonCardFlips.Count == 0
			&& effectSpec.FaceStateLocks.Count == 0)
		{
			return new CanExecuteResult
			{
				CanExecute = false,
				FailedConditions = ["AlterResources requires at least one chakra adjustment, summon-card flip, or face-state lock."],
			};
		}

		var baseResult = canExecuteEvaluator.Evaluate(context, effectSpec, includeValidTargets: false);
		if (!baseResult.CanExecute)
		{
			return baseResult;
		}

		foreach (var adjustment in effectSpec.ChakraAdjustments)
		{
			if (adjustment.Amount <= 0)
			{
				return new CanExecuteResult
				{
					CanExecute = false,
					FailedConditions = ["AlterResources chakra adjustment amount must be greater than zero."],
				};
			}

			if (adjustment.Operation != ChakraAdjustmentOperation.Pay)
			{
				continue;
			}

					foreach (var player in ResolveTargetPlayers(context.Game.State, context.ActingPlayer.Id, adjustment.TargetRange))
			{
				if (player.ResourcePool < adjustment.Amount)
				{
					return new CanExecuteResult
					{
						CanExecute = false,
						FailedConditions =
						[
							$"Player '{player.PlayerId}' does not have enough chakra to pay {adjustment.Amount}."
						],
					};
				}
			}
		}

		foreach (var faceStateLock in effectSpec.FaceStateLocks)
		{
			if (faceStateLock.Operation != FaceStateLockOperation.CannotTurnFaceUp)
			{
				return new CanExecuteResult
				{
					CanExecute = false,
					FailedConditions = ["AlterResources face-state lock operation is not supported."],
				};
			}

			if (!CardRuntimeEffectStateService.IsDurationSupportedForFaceStateLocks(effectSpec.DurationMode))
			{
				return new CanExecuteResult
				{
					CanExecute = false,
					FailedConditions = ["AlterResources face-state locks require a temporary duration mode."],
				};
			}
		}

		return baseResult;
	}

	public IReadOnlyList<GameEffectTargetReference> GetValidTargets(GameCardEffectContext context)
	{
		return [];
	}

	public ErrorOr<Success> Execute(GameCardEffectContext context, IReadOnlyList<GameEffectTargetReference> selectedTargets)
	{
		var effectSpec = effectSpecResolver.Resolve(context, RuntimeEffects.AlterResources);
		if (effectSpec is null)
		{
			return Error.Validation(
				code: "Game.Effect.AlterResources.MissingEffectSpec",
				description: "AlterResources effect is not defined on the source card.");
		}

		if (effectSpec.ChakraAdjustments.Count == 0
			&& effectSpec.SummonCardFlips.Count == 0
			&& effectSpec.FaceStateLocks.Count == 0)
		{
			return Error.Validation(
				code: "Game.Effect.AlterResources.NoOperations",
				description: "AlterResources requires at least one chakra adjustment, summon-card flip, or face-state lock.");
		}

		var affectedPlayerIds = new HashSet<string>(StringComparer.Ordinal)
		{
			context.ActingPlayer.Id,
		};

		foreach (var adjustment in effectSpec.ChakraAdjustments)
		{
			if (adjustment.Amount <= 0)
			{
				return Error.Validation(
					code: "Game.Effect.AlterResources.InvalidAmount",
					description: "AlterResources chakra adjustment amount must be greater than zero.");
			}

					foreach (var player in ResolveTargetPlayers(context.Game.State, context.ActingPlayer.Id, adjustment.TargetRange))
			{
				var result = ApplyChakraAdjustment(player, adjustment);
				if (result.IsError)
				{
					return result.Errors;
				}

				affectedPlayerIds.Add(player.PlayerId);
			}
		}

		foreach (var flip in effectSpec.SummonCardFlips)
		{
			var shouldBeFaceUp = flip.FaceState == SummonCardFaceState.FaceUp;

					foreach (var player in ResolveTargetPlayers(context.Game.State, context.ActingPlayer.Id, flip.TargetRange))
			{
				if (shouldBeFaceUp
					&& CardRuntimeEffectStateService.IsFaceUpTransitionBlocked(
						context.Game.State,
						player.PlayerId,
						FaceStateTargetCategory.SummonCard))
				{
					return Error.Validation(
						code: "Game.Effect.FaceStateLock.CannotTurnFaceUp.SummonCard",
						description: $"Player '{player.PlayerId}' cannot turn Summon Card face-up while a face-state lock is active.");
				}

				if (!TrySetSummonCardFaceState(context.Game.State, player.PlayerId, shouldBeFaceUp))
				{
					return Error.Validation(
						code: "Game.Effect.AlterResources.UnknownSummonCardOwner",
						description: $"Could not map player '{player.PlayerId}' to summon-card state.");
				}

				affectedPlayerIds.Add(player.PlayerId);
			}
		}

		foreach (var faceStateLock in effectSpec.FaceStateLocks)
		{
			if (faceStateLock.Operation != FaceStateLockOperation.CannotTurnFaceUp)
			{
				return Error.Validation(
					code: "Game.Effect.AlterResources.UnsupportedFaceStateLockOperation",
					description: "AlterResources face-state lock operation is not supported.");
			}

			if (!CardRuntimeEffectStateService.IsDurationSupportedForFaceStateLocks(effectSpec.DurationMode))
			{
				return Error.Validation(
					code: "Game.Effect.AlterResources.FaceStateLockDurationNotSupported",
					description: "AlterResources face-state locks require a temporary duration mode.");
			}

			if (context.SourceCardInstance is null)
			{
				return Error.Validation(
					code: "Game.Effect.AlterResources.FaceStateLockSourceMissing",
					description: "AlterResources face-state locks require a source card instance.");
			}

			foreach (var player in ResolveTargetPlayers(context.Game.State, context.ActingPlayer.Id, faceStateLock.TargetRange))
			{
				CardRuntimeEffectStateService.AddTemporaryFaceStateLockEffect(
					context.Game.State,
					context.SourceCardInstance,
					effectSpec.Id,
					faceStateLock.TargetCategory,
					faceStateLock.Operation,
					player.PlayerId,
					effectSpec.DurationMode);

				affectedPlayerIds.Add(player.PlayerId);
			}
		}

		var mutationResult = EmitMutation(context, affectedPlayerIds);
		if (mutationResult.IsError)
		{
			return mutationResult.Errors;
		}

		return Result.Success;
	}

	private static ErrorOr<Success> ApplyChakraAdjustment(PlayerState player, ChakraAdjustmentSpec adjustment)
	{
		player.ResourcePool = adjustment.Operation switch
		{
			ChakraAdjustmentOperation.Pay => player.ResourcePool - adjustment.Amount,
			ChakraAdjustmentOperation.Recover => player.ResourcePool + adjustment.Amount,
			_ => player.ResourcePool,
		};

		if (player.ResourcePool < 0)
		{
			return Error.Validation(
				code: "Game.Effect.AlterResources.InsufficientChakra",
				description: $"Player '{player.PlayerId}' does not have enough chakra to pay {adjustment.Amount}.");
		}

		return Result.Success;
	}

	private static IReadOnlyList<PlayerState> ResolveTargetPlayers(GameState state, string actingPlayerId, EffectTargetRange scope)
	{
		return scope switch
		{
			EffectTargetRange.Self => state.Players
				.Where(player => string.Equals(player.PlayerId, actingPlayerId, StringComparison.Ordinal))
				.ToList(),
			EffectTargetRange.Opponent => state.Players
				.Where(player => !string.Equals(player.PlayerId, actingPlayerId, StringComparison.Ordinal))
				.ToList(),
			EffectTargetRange.Any => state.Players,
			_ => [],
		};
	}

	private static bool TrySetSummonCardFaceState(GameState state, string playerId, bool isFaceUp)
	{
		var index = state.Players.FindIndex(player =>
			string.Equals(player.PlayerId, playerId, StringComparison.Ordinal));

		if (index == 0)
		{
			state.Player1SummonCard = isFaceUp;
			return true;
		}

		if (index == 1)
		{
			state.Player2SummonCard = isFaceUp;
			return true;
		}

		return false;
	}

	private ErrorOr<Success> EmitMutation(GameCardEffectContext context, IReadOnlyCollection<string> affectedPlayerIds)
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
			Kind = GameMutationKind.EffectResolved,
			GameId = context.Game.State.GameId,
			ActingPlayerId = context.ActingPlayer.Id,
			TurnNumber = context.Game.State.TurnNumber,
			Phase = context.Game.State.Phase,
			AffectedPlayerIds = affectedPlayerIds.ToList(),
		};

		var orchestrationResult = reactiveEffectOrchestrator.ApplyPostMutationEffects(context.Game, mutationEvent, context.ActingPlayer.Id);
		return orchestrationResult.IsError ? orchestrationResult.Errors : Result.Success;
	}
}
