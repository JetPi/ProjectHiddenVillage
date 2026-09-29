using ErrorOr;
using Microsoft.Extensions.DependencyInjection;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

/// <summary>
/// "Search your deck for a card, [reveal it,] add it to your hand[, then shuffle]".
///
/// The player picks the card with a prompt (the node carries <see cref="EffectSelectionTiming.Prompted"/>, so
/// the sequential executor asks for the selection and resumes here with it). The move itself reuses the same
/// <see cref="MoveCardActionSpec"/> vocabulary as <see cref="MoveCardEffect"/> - the only difference is that
/// the source must be the deck, plus the reveal/shuffle behaviour the search keyword implies.
/// </summary>
public sealed class SearchCardEffect(
    IGameRuntimeEffectSpecResolver effectSpecResolver,
    IGameEffectCanExecuteEvaluator canExecuteEvaluator,
    IGameEffectTargetResolver targetResolver,
    IGameRuntimeDeckService runtimeDeckService,
    IServiceProvider? serviceProvider = null) : IGameCardEffect
{
    private const string RandomSeedArgumentKey = "searchCardRandomSeed";

    private readonly IGameRuntimeEffectSpecResolver effectSpecResolver = effectSpecResolver;
    private readonly IGameEffectCanExecuteEvaluator canExecuteEvaluator = canExecuteEvaluator;
    private readonly IGameEffectTargetResolver targetResolver = targetResolver;
    private readonly IGameRuntimeDeckService runtimeDeckService = runtimeDeckService;
    private readonly IServiceProvider? serviceProvider = serviceProvider;

    public const string EffectKey = "SearchCard";

    public string EffectTypeKey => EffectKey;

    public CanExecuteResult CanExecute(GameCardEffectContext context)
    {
        var effectSpec = effectSpecResolver.Resolve(context, RuntimeEffects.SearchCard);
        if (effectSpec is null)
        {
            return Failed("SearchCard effect is not defined on the source card.");
        }

        var actionValidation = ValidateSearchAction(effectSpec);
        if (actionValidation.IsError)
        {
            return Failed(actionValidation.FirstError.Description);
        }

        return canExecuteEvaluator.Evaluate(context, effectSpec, includeValidTargets: true);
    }

    public IReadOnlyList<GameEffectTargetReference> GetValidTargets(GameCardEffectContext context)
    {
        var effectSpec = effectSpecResolver.Resolve(context, RuntimeEffects.SearchCard);
        if (effectSpec is null || ValidateSearchAction(effectSpec).IsError)
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

    public ErrorOr<Success> Execute(
        GameCardEffectContext context,
        IReadOnlyList<GameEffectTargetReference> selectedTargets)
    {
        var effectSpec = effectSpecResolver.Resolve(context, RuntimeEffects.SearchCard);
        if (effectSpec is null)
        {
            return Error.Validation(
                code: "Game.Effect.SearchCard.MissingEffectSpec",
                description: "SearchCard effect is not defined on the source card.");
        }

        var actionValidation = ValidateSearchAction(effectSpec);
        if (actionValidation.IsError)
        {
            return actionValidation.Errors;
        }

        if (selectedTargets.Count == 0)
        {
            return Error.Validation(
                code: "Game.Effect.SearchCard.NoTargets",
                description: "SearchCard requires at least one selected card to search for.");
        }

        var action = ResolveSearchAction(effectSpec);
        var destinationZone = action.DestinationZone!.Value;
        var affectedCardInstanceIds = new List<string>();

        foreach (var target in selectedTargets)
        {
            var sourcePlayer = context.Game.State.Players.FirstOrDefault(player =>
                string.Equals(player.PlayerId, target.PlayerId, StringComparison.Ordinal));

            var searchedCard = sourcePlayer?.Deck.FirstOrDefault(card =>
                string.Equals(card.InstanceId, target.CardInstanceId, StringComparison.Ordinal));

            if (sourcePlayer is null || searchedCard is null)
            {
                continue;
            }

            // Reveal while it leaves the searched zone: RevealedInZone = Deck means the card stops being
            // visible to the opponent the moment it arrives in its destination zone (usually the hand).
            if (effectSpec.SearchRevealSelection)
            {
                searchedCard.IsRevealedToBothPlayers = true;
                searchedCard.RevealedInZone = PlayerZone.Deck;
            }

            runtimeDeckService.MoveCardToZone(
                gameInstance: context.Game,
                playerId: sourcePlayer.PlayerId,
                sourceZone: PlayerZone.Deck,
                destinationZone: destinationZone,
                cardInstanceId: searchedCard.InstanceId,
                destinationIndex: ResolveDestinationIndex(action, sourcePlayer, destinationZone),
                destinationPlayerId: sourcePlayer.PlayerId,
                allowCrossPlayer: action.AllowCrossPlayer);

            affectedCardInstanceIds.Add(searchedCard.InstanceId);
        }

        if (affectedCardInstanceIds.Count == 0)
        {
            return Error.Validation(
                code: "Game.Effect.SearchCard.NoCardsMoved",
                description: "None of the selected cards were still in the searched deck.");
        }

        if (effectSpec.SearchShuffleAfter)
        {
            ShuffleSearchedDeck(context, affectedCardInstanceIds.Count);
        }

        return EmitMutation(
            context,
            GameMutationKind.CardMovedZone,
            affectedCardInstanceIds,
            [context.ActingPlayer.Id]);
    }

    private static ErrorOr<Success> ValidateSearchAction(EffectSpec effectSpec)
    {
        var moveActions = effectSpec.MoveCardActions
            .Where(action => action.Operation == MoveCardOperationType.Move)
            .ToList();

        if (moveActions.Count != 1)
        {
            return Error.Validation(
                code: "Game.Effect.SearchCard.InvalidActionCount",
                description: "SearchCard requires exactly one move action.");
        }

        if (moveActions[0].SourceZone != PlayerZone.Deck)
        {
            return Error.Validation(
                code: "Game.Effect.SearchCard.InvalidSourceZone",
                description: "SearchCard move actions must search the deck.");
        }

        if (moveActions[0].DestinationZone is null)
        {
            return Error.Validation(
                code: "Game.Effect.SearchCard.MissingDestination",
                description: "SearchCard move actions require a destination zone.");
        }

        return Result.Success;
    }

    private static MoveCardActionSpec ResolveSearchAction(EffectSpec effectSpec)
    {
        return effectSpec.MoveCardActions.First(action => action.Operation == MoveCardOperationType.Move);
    }

    private static int? ResolveDestinationIndex(
        MoveCardActionSpec action,
        PlayerState destinationPlayer,
        PlayerZone destinationZone)
    {
        if (destinationZone != PlayerZone.Deck)
        {
            return action.DestinationIndex;
        }

        var placement = action.DeckPlacement ?? MoveCardDeckPlacementType.Top;

        return placement switch
        {
            MoveCardDeckPlacementType.Top => 0,
            MoveCardDeckPlacementType.Bottom => destinationPlayer.Deck.Count,
            _ => action.DestinationIndex,
        };
    }

    private void ShuffleSearchedDeck(GameCardEffectContext context, int movedCardCount)
    {
        var actingPlayer = context.Game.State.Players.FirstOrDefault(player =>
            string.Equals(player.PlayerId, context.ActingPlayer.Id, StringComparison.Ordinal));

        if (actingPlayer is null)
        {
            return;
        }

        runtimeDeckService.DeckShuffle(actingPlayer.Deck, CreateDeterministicRandom(context, movedCardCount));
    }

    private static Random CreateDeterministicRandom(GameCardEffectContext context, int movedCardCount)
    {
        if (context.Arguments.TryGetValue(RandomSeedArgumentKey, out var configuredSeed)
            && int.TryParse(configuredSeed, out var parsedSeed))
        {
            return new Random(parsedSeed);
        }

        var material = string.Join('|',
            context.Game.State.GameId,
            context.Game.State.TurnNumber.ToString(),
            context.ActingPlayer.Id,
            movedCardCount.ToString());

        return new Random(material.GetHashCode(StringComparison.Ordinal));
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

        var orchestrationResult = reactiveEffectOrchestrator.ApplyPostMutationEffects(
            context.Game,
            mutationEvent,
            context.ActingPlayer.Id);

        return orchestrationResult.IsError ? orchestrationResult.Errors : Result.Success;
    }

    private static CanExecuteResult Failed(string message)
    {
        return new CanExecuteResult
        {
            CanExecute = false,
            FailedConditions = [message],
        };
    }
}
