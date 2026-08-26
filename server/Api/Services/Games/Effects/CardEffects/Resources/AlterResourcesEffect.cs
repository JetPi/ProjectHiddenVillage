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
			if (!ResolveFaceStateTargetCategory(faceStateLock.TargetCategory).HasValue)
			{
				return new CanExecuteResult
				{
					CanExecute = false,
					FailedConditions = ["AlterResources face-state lock target category must be ChakraCard or SupportZoneCards."],
				};
			}

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

		foreach (var flip in effectSpec.SummonCardFlips)
		{
			if (!ResolveFaceStateTargetCategory(flip.TargetCategory).HasValue)
			{
				return new CanExecuteResult
				{
					CanExecute = false,
					FailedConditions = ["AlterResources face-state flips support only ChakraCard and SupportZoneCards target categories."],
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
			var targetCategory = ResolveFaceStateTargetCategory(flip.TargetCategory);

			if (!targetCategory.HasValue)
			{
				return Error.Validation(
					code: "Game.Effect.AlterResources.UnsupportedFaceStateTargetCategory",
					description: "AlterResources face-state flips support only ChakraCard and SupportZoneCards target categories.");
			}

					foreach (var player in ResolveTargetPlayers(context.Game.State, context.ActingPlayer.Id, flip.TargetRange))
			{
				if (shouldBeFaceUp
					&& CardRuntimeEffectStateService.IsFaceUpTransitionBlocked(
						context.Game.State,
						player.PlayerId,
						targetCategory.Value))
				{
					return Error.Validation(
						code: "Game.Effect.FaceStateLock.CannotTurnFaceUp",
						description: $"Player '{player.PlayerId}' cannot turn the selected face-state target category face-up while a face-state lock is active.");
				}

				if (!TrySetFaceStateForCategory(context.Game.State, player.PlayerId, targetCategory.Value, shouldBeFaceUp))
				{
					return Error.Validation(
						code: "Game.Effect.AlterResources.FaceStateTargetUnavailable",
						description: $"Could not resolve a face-state target for player '{player.PlayerId}'.");
				}

				affectedPlayerIds.Add(player.PlayerId);
			}
		}

		foreach (var faceStateLock in effectSpec.FaceStateLocks)
		{
			var targetCategory = ResolveFaceStateTargetCategory(faceStateLock.TargetCategory);
			if (!targetCategory.HasValue)
			{
				return Error.Validation(
					code: "Game.Effect.AlterResources.UnsupportedFaceStateLockTargetCategory",
					description: "AlterResources face-state locks support only ChakraCard and SupportZoneCards target categories.");
			}

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
					targetCategory.Value,
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

	private static FaceStateTargetCategory? ResolveFaceStateTargetCategory(FaceStateTargetCategory category)
	{
		return category switch
		{
			FaceStateTargetCategory.ChakraCard => FaceStateTargetCategory.ChakraCard,
			FaceStateTargetCategory.SupportZoneCards => FaceStateTargetCategory.SupportZoneCards,
			FaceStateTargetCategory.SummonCard => FaceStateTargetCategory.ChakraCard,
			_ => null,
		};
	}

	private static bool TrySetFaceStateForCategory(
		GameState state,
		string playerId,
		FaceStateTargetCategory targetCategory,
		bool isFaceUp)
	{
		return targetCategory switch
		{
			FaceStateTargetCategory.ChakraCard => TrySetChakraFaceState(state, playerId, isFaceUp),
			FaceStateTargetCategory.SupportZoneCards => TrySetSupportZoneFaceState(state, playerId, isFaceUp),
			_ => false,
		};
	}

	private static bool TrySetChakraFaceState(GameState state, string playerId, bool isFaceUp)
	{
		var index = state.Players.FindIndex(player =>
			string.Equals(player.PlayerId, playerId, StringComparison.Ordinal));

		var chakraStates = index switch
		{
			0 => state.Player1CurrentChakras,
			1 => state.Player2CurrentChakras,
			_ => null,
		};

		if (chakraStates is null)
		{
			return false;
		}

		var sourceState = isFaceUp ? false : true;
		for (var i = 0; i < chakraStates.Length; i++)
		{
			if (chakraStates[i] != sourceState)
			{
				continue;
			}

			chakraStates[i] = isFaceUp;
			return true;
		}

		return true;
	}

	private static bool TrySetSupportZoneFaceState(GameState state, string playerId, bool isFaceUp)
	{
		var player = state.Players.FirstOrDefault(current =>
			string.Equals(current.PlayerId, playerId, StringComparison.Ordinal));

		if (player is null)
		{
			return false;
		}

		foreach (var card in player.SupportZone)
		{
			card.IsFaceUp = isFaceUp;
			card.IsRevealedToBothPlayers = isFaceUp;
			card.RevealedInZone = isFaceUp ? PlayerZone.SupportZone : null;
		}

		return true;
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
