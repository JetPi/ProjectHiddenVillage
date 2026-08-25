using ErrorOr;
using Microsoft.Extensions.DependencyInjection;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using System.Security.Cryptography;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class MoveCardEffect(
    IGameRuntimeEffectSpecResolver effectSpecResolver,
    IGameEffectCanExecuteEvaluator canExecuteEvaluator,
    IGameEffectTargetResolver targetResolver,
    IGameRuntimeDeckService runtimeDeckService,
    IServiceProvider? serviceProvider = null) : IGameCardEffect
{
    private const int TopDeckIndex = 0;
    private const string ModeArgumentKey = "moveCardMode";
    private const string DrawModeValue = "draw";
    private const string MoveModeValue = "move";
    private const string DrawCountArgumentKey = "moveCardDrawCount";
    private const string MoveCountArgumentKey = "moveCardMoveCount";
    private const string SourceZoneArgumentKey = "moveCardSourceZone";
    private const string DestinationZoneArgumentKey = "moveCardDestinationZone";
    private const string DestinationIndexArgumentKey = "moveCardDestinationIndex";
    private const string DeckPlacementArgumentKey = "moveCardDeckPlacement";
    private const string MultiCardOrderingArgumentKey = "moveCardMultiCardOrdering";
    private const string DestinationPlayerIdArgumentKey = "moveCardDestinationPlayerId";
    private const string AllowCrossPlayerArgumentKey = "moveCardAllowCrossPlayer";
    private const string RandomSeedArgumentKey = "moveCardRandomSeed";

    private static readonly HashSet<PlayerZone> SupportedMoveZones =
    [
        PlayerZone.Hand,
        PlayerZone.Deck,
        PlayerZone.Trash,
        PlayerZone.ExileZone,
    ];

    private readonly IGameRuntimeEffectSpecResolver effectSpecResolver = effectSpecResolver;
    private readonly IGameEffectCanExecuteEvaluator canExecuteEvaluator = canExecuteEvaluator;
    private readonly IGameEffectTargetResolver targetResolver = targetResolver;
    private readonly IGameRuntimeDeckService runtimeDeckService = runtimeDeckService;
    private readonly IServiceProvider? serviceProvider = serviceProvider;

    public const string EffectKey = "MoveCard";

    public string EffectTypeKey => EffectKey;

    public CanExecuteResult CanExecute(GameCardEffectContext context)
    {
        var effectSpec = effectSpecResolver.Resolve(context, RuntimeEffects.MoveCard);
        if (effectSpec is null)
        {
            return new CanExecuteResult
            {
                CanExecute = false,
                FailedConditions = ["MoveCard effect is not defined on the source card."],
            };
        }

        if (effectSpec.MoveCardActions.Count == 0)
        {
            return new CanExecuteResult
            {
                CanExecute = false,
                FailedConditions = ["MoveCard requires at least one move-card action rule."],
            };
        }

        var baseResult = canExecuteEvaluator.Evaluate(context, effectSpec, includeValidTargets: true);
        if (!baseResult.CanExecute)
        {
            return baseResult;
        }

        var actionValidation = ValidateActions(effectSpec.MoveCardActions);
        if (actionValidation.IsError)
        {
            return new CanExecuteResult
            {
                CanExecute = false,
                FailedConditions = [actionValidation.FirstError.Description],
            };
        }

        return baseResult;
    }

    public IReadOnlyList<GameEffectTargetReference> GetValidTargets(GameCardEffectContext context)
    {
        var effectSpec = effectSpecResolver.Resolve(context, RuntimeEffects.MoveCard);
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
        var effectSpec = effectSpecResolver.Resolve(context, RuntimeEffects.MoveCard);
        if (effectSpec is null)
        {
            return Error.Validation(
                code: "Game.Effect.MoveCard.MissingEffectSpec",
                description: "MoveCard effect is not defined on the source card.");
        }

        if (effectSpec.MoveCardActions.Count == 0)
        {
            return Error.Validation(
                code: "Game.Effect.MoveCard.NoActions",
                description: "MoveCard requires at least one move-card action rule.");
        }

        var actionValidation = ValidateActions(effectSpec.MoveCardActions);
        if (actionValidation.IsError)
        {
            return actionValidation.Errors;
        }

        foreach (var action in effectSpec.MoveCardActions)
        {
            var result = action.Operation switch
            {
                MoveCardOperationType.Draw => ExecuteDrawMode(context, action),
                MoveCardOperationType.Move => ExecuteMoveMode(context, selectedTargets, action),
                _ => Error.Validation(
                    code: "Game.Effect.MoveCard.InvalidOperation",
                    description: $"Unsupported move-card operation '{action.Operation}'."),
            };

            if (result.IsError)
            {
                return result.Errors;
            }
        }

        return Result.Success;
    }

    private ErrorOr<Success> ExecuteDrawMode(GameCardEffectContext context, MoveCardActionSpec action)
    {
        var drawCount = action.DrawCount ?? 1;
        var affectedCardIds = new List<string>();

        for (var index = 0; index < drawCount; index++)
        {
            var drawn = runtimeDeckService.DrawCardFromDeck(context.Game, context.ActingPlayer.Id);
            if (drawn is null)
            {
                break;
            }

            affectedCardIds.Add(drawn.InstanceId);
        }

        if (affectedCardIds.Count == 0)
        {
            return Error.Validation(
                code: "Game.Effect.MoveCard.Draw.NoCardsDrawn",
                description: "No cards were available to draw.");
        }

        return EmitMutation(
            context,
            GameMutationKind.CardMovedZone,
            affectedCardIds,
            [context.ActingPlayer.Id]);
    }

    private ErrorOr<Success> ExecuteMoveMode(
        GameCardEffectContext context,
        IReadOnlyList<GameEffectTargetReference> selectedTargets,
        MoveCardActionSpec action)
    {
        if (selectedTargets.Count == 0)
        {
            return Error.Validation(
                code: "Game.Effect.MoveCard.Move.MissingTargets",
                description: "moveCard move mode requires at least one selected target.");
        }

        var sourceZone = action.SourceZone!.Value;
        var destinationZone = action.DestinationZone!.Value;
        var orderedTargetsResult = ResolveOrderedTargets(context, selectedTargets, action);
        if (orderedTargetsResult.IsError)
        {
            return orderedTargetsResult.Errors;
        }

        var orderedTargets = orderedTargetsResult.Value;
        var moveCount = action.MoveCount ?? orderedTargets.Count;
        if (moveCount <= 0)
        {
            return Error.Validation(
                code: "Game.Effect.MoveCard.Move.InvalidCount",
                description: "MoveCard move count must be greater than zero.");
        }

        if (orderedTargets.Count < moveCount)
        {
            return Error.Validation(
                code: "Game.Effect.MoveCard.Move.InsufficientTargets",
                description: $"MoveCard move count is '{moveCount}' but only '{orderedTargets.Count}' target(s) were selected.");
        }

        var targetsToMove = orderedTargets.Take(moveCount).ToList();
        var affectedCardIds = new List<string>();
        var affectedPlayerIds = new HashSet<string>(StringComparer.Ordinal)
        {
            context.ActingPlayer.Id,
        };

        foreach (var target in targetsToMove)
        {
            if (target.Zone != sourceZone)
            {
                return Error.Validation(
                    code: "Game.Effect.MoveCard.Move.SourceZoneMismatch",
                    description: $"Target '{target.CardInstanceId}' is in zone '{target.Zone}' but moveCardSourceZone is '{sourceZone}'.");
            }

            var destinationIndex = ResolveDestinationIndex(context.Game.State, context.ActingPlayer.Id, target, action);

            var resolvedDestinationPlayerId = ResolveDestinationPlayerId(
                context.Game.State,
                context.ActingPlayer.Id,
                target.PlayerId,
                action);

            try
            {
                var moved = runtimeDeckService.MoveCardToZone(
                    context.Game,
                    playerId: target.PlayerId,
                    sourceZone: sourceZone,
                    destinationZone: destinationZone,
                    cardInstanceId: target.CardInstanceId,
                    destinationIndex: destinationIndex,
                    destinationPlayerId: resolvedDestinationPlayerId,
                    allowCrossPlayer: action.AllowCrossPlayer);

                affectedCardIds.Add(moved.InstanceId);
                affectedPlayerIds.Add(target.PlayerId);
                affectedPlayerIds.Add(resolvedDestinationPlayerId);
            }
            catch (ArgumentOutOfRangeException ex)
            {
                return Error.Validation(
                    code: "Game.Effect.MoveCard.Move.InvalidDestinationIndex",
                    description: ex.Message);
            }
            catch (ArgumentException ex)
            {
                return Error.Validation(
                    code: "Game.Effect.MoveCard.Move.InvalidArguments",
                    description: ex.Message);
            }
            catch (InvalidOperationException ex)
            {
                return Error.Validation(
                    code: "Game.Effect.MoveCard.Move.InvalidOperation",
                    description: ex.Message);
            }
        }

        return EmitMutation(
            context,
            GameMutationKind.CardMovedZone,
            affectedCardIds,
            affectedPlayerIds);
    }

    private static int? ResolveDestinationIndex(
        GameState state,
        string actingPlayerId,
        GameEffectTargetReference target,
        MoveCardActionSpec action)
    {
        if (action.Operation != MoveCardOperationType.Move)
        {
            return action.DestinationIndex;
        }

        if (action.DestinationZone != PlayerZone.Deck)
        {
            return action.DestinationIndex;
        }

        var placement = action.DeckPlacement ?? MoveCardDeckPlacementType.Top;
        if (placement == MoveCardDeckPlacementType.Index)
        {
            return action.DestinationIndex;
        }

        var destinationPlayerId = ResolveDestinationPlayerId(
            state,
            actingPlayerId: actingPlayerId,
            sourcePlayerId: target.PlayerId,
            action);

        var playerState = state.Players.FirstOrDefault(player => string.Equals(player.PlayerId, destinationPlayerId, StringComparison.Ordinal));
        if (playerState is null)
        {
            return TopDeckIndex;
        }

        return placement switch
        {
            MoveCardDeckPlacementType.Top => TopDeckIndex,
            MoveCardDeckPlacementType.Bottom => playerState.Deck.Count,
            MoveCardDeckPlacementType.Index => action.DestinationIndex,
            _ => action.DestinationIndex,
        };
    }

    private ErrorOr<IReadOnlyList<GameEffectTargetReference>> ResolveOrderedTargets(
        GameCardEffectContext context,
        IReadOnlyList<GameEffectTargetReference> selectedTargets,
        MoveCardActionSpec action)
    {
        var ordering = action.MultiCardOrdering ?? MoveCardMultiCardOrderingType.SelectedOrder;
        if (ordering == MoveCardMultiCardOrderingType.SelectedOrder || selectedTargets.Count <= 1)
        {
            return selectedTargets.ToList();
        }

        if (ordering != MoveCardMultiCardOrderingType.Random)
        {
            return Error.Validation(
                code: "Game.Effect.MoveCard.Move.InvalidOrdering",
                description: $"Unsupported multi-card ordering '{ordering}'.");
        }

        var shuffled = selectedTargets.ToList();
        var random = CreateDeterministicRandom(context, action);
        for (var index = shuffled.Count - 1; index > 0; index--)
        {
            var swapIndex = random.Next(index + 1);
            (shuffled[index], shuffled[swapIndex]) = (shuffled[swapIndex], shuffled[index]);
        }

        return shuffled;
    }

    private static Random CreateDeterministicRandom(GameCardEffectContext context, MoveCardActionSpec action)
    {
        if (context.Arguments.TryGetValue(RandomSeedArgumentKey, out var configuredSeed)
            && int.TryParse(configuredSeed, out var parsedSeed))
        {
            return new Random(parsedSeed);
        }

        var material = string.Join('|',
            context.Game.State.GameId,
            context.Game.State.TurnNumber.ToString(),
            action.Operation.ToString(),
            action.SourceZone?.ToString() ?? string.Empty,
            action.DestinationZone?.ToString() ?? string.Empty,
            action.DestinationIndex?.ToString() ?? string.Empty,
            action.DeckPlacement?.ToString() ?? string.Empty,
            action.MultiCardOrdering?.ToString() ?? string.Empty,
            context.ActingPlayer.Id);

        var hash = SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(material));
        var seed = BitConverter.ToInt32(hash, 0);
        return new Random(seed);
    }

    private static ErrorOr<Success> ValidateActions(IReadOnlyList<MoveCardActionSpec> actions)
    {
        foreach (var action in actions)
        {
            if (action.Operation == MoveCardOperationType.Draw)
            {
                if (action.DrawCount.HasValue && action.DrawCount.Value <= 0)
                {
                    return Error.Validation(
                        code: "Game.Effect.MoveCard.Draw.InvalidCount",
                        description: "MoveCard draw action count must be greater than zero.");
                }

                continue;
            }

            if (!action.SourceZone.HasValue || !action.DestinationZone.HasValue)
            {
                return Error.Validation(
                    code: "Game.Effect.MoveCard.Move.MissingZone",
                    description: "MoveCard move actions require source and destination zones.");
            }

            if (!SupportedMoveZones.Contains(action.SourceZone.Value)
                || !SupportedMoveZones.Contains(action.DestinationZone.Value))
            {
                return Error.Validation(
                    code: "Game.Effect.MoveCard.Move.UnsupportedZone",
                    description: "MoveCard move actions only support Hand, Deck, Trash, and Exile zones in this version.");
            }

            if (action.DestinationIndex.HasValue && action.DestinationIndex.Value < 0)
            {
                return Error.Validation(
                    code: "Game.Effect.MoveCard.Move.InvalidDestinationIndex",
                    description: "MoveCard destination index must be non-negative.");
            }

            if (action.MoveCount.HasValue && action.MoveCount.Value <= 0)
            {
                return Error.Validation(
                    code: "Game.Effect.MoveCard.Move.InvalidCount",
                    description: "MoveCard move count must be greater than zero.");
            }

            if (action.DeckPlacement.HasValue && !Enum.IsDefined(action.DeckPlacement.Value))
            {
                return Error.Validation(
                    code: "Game.Effect.MoveCard.Move.InvalidDeckPlacement",
                    description: "MoveCard deck placement must be Top, Bottom, or Index.");
            }

            if (action.MultiCardOrdering.HasValue && !Enum.IsDefined(action.MultiCardOrdering.Value))
            {
                return Error.Validation(
                    code: "Game.Effect.MoveCard.Move.InvalidMultiCardOrdering",
                    description: "MoveCard multi-card ordering must be SelectedOrder or Random.");
            }

            if (action.DestinationZone == PlayerZone.Deck)
            {
                var placement = action.DeckPlacement ?? MoveCardDeckPlacementType.Top;
                if (placement == MoveCardDeckPlacementType.Index && !action.DestinationIndex.HasValue)
                {
                    return Error.Validation(
                        code: "Game.Effect.MoveCard.Move.MissingDestinationIndex",
                        description: "MoveCard destination index is required when deck placement is Index.");
                }
            }

            if (action.DestinationPlayerRange is not (EffectTargetRange.Self or EffectTargetRange.Opponent or EffectTargetRange.Any))
            {
                return Error.Validation(
                    code: "Game.Effect.MoveCard.Move.InvalidDestinationPlayerRange",
                    description: "MoveCard destination player range must be Self, Opponent, or Any.");
            }
        }

        return Result.Success;
    }

    private static string ResolveDestinationPlayerId(
        GameState state,
        string actingPlayerId,
        string sourcePlayerId,
        MoveCardActionSpec action)
    {
        var candidatePlayerIds = action.DestinationPlayerRange switch
        {
            EffectTargetRange.Self => [actingPlayerId],
            EffectTargetRange.Opponent => state.Players
                .Where(player => !string.Equals(player.PlayerId, actingPlayerId, StringComparison.Ordinal))
                .Select(player => player.PlayerId)
                .ToList(),
            EffectTargetRange.Any => state.Players.Select(player => player.PlayerId).ToList(),
            _ => [sourcePlayerId],
        };

        if (candidatePlayerIds.Any(playerId => string.Equals(playerId, sourcePlayerId, StringComparison.Ordinal)))
        {
            return sourcePlayerId;
        }

        return candidatePlayerIds.FirstOrDefault() ?? sourcePlayerId;
    }

    private ErrorOr<Success> EmitMutation(
        GameCardEffectContext context,
        GameMutationKind mutationKind,
        IReadOnlyCollection<string> affectedCardInstanceIds,
        IReadOnlyCollection<string> affectedPlayerIds)
    {
        if (affectedCardInstanceIds.Count == 0)
        {
            return Result.Success;
        }

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
            AffectedPlayerIds = affectedPlayerIds.Distinct(StringComparer.Ordinal).ToList(),
        };

        var orchestrationResult = reactiveEffectOrchestrator.ApplyPostMutationEffects(context.Game, mutationEvent, context.ActingPlayer.Id);
        return orchestrationResult.IsError ? orchestrationResult.Errors : Result.Success;
    }
}
