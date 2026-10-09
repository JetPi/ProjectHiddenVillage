using ErrorOr;
using Microsoft.Extensions.DependencyInjection;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class TributeSummonCardEffect(
    IGameRuntimeEffectSpecResolver effectSpecResolver,
    IGameEffectCanExecuteEvaluator canExecuteEvaluator,
    IGameEffectTargetResolver targetResolver,
    IServiceProvider? serviceProvider = null) : IGameCardEffect
{
    private const string SummonTargetIdArgumentKey = "summonTargetId";

    private readonly IGameRuntimeEffectSpecResolver effectSpecResolver = effectSpecResolver;
    private readonly IGameEffectCanExecuteEvaluator canExecuteEvaluator = canExecuteEvaluator;
    private readonly IGameEffectTargetResolver targetResolver = targetResolver;
    private readonly IServiceProvider? serviceProvider = serviceProvider;

    public const string EffectKey = "Tribute";

    public string EffectTypeKey => EffectKey;

    public CanExecuteResult CanExecute(GameCardEffectContext context)
    {
        var effectSpec = effectSpecResolver.Resolve(context, RuntimeEffects.Tribute);
        if (effectSpec is null)
        {
            return new CanExecuteResult
            {
                CanExecute = false,
                FailedConditions = ["Tribute effect is not defined on the source card."],
            };
        }

        var hasTributeComposition = effectSpec.TargetRules.TributeComposition is not null;

        // The summon candidate is never part of the tribute material selection, so tribute
        // compositions bypass the generic available-target count check and are gated by the
        // distinct material assignment solver instead.
        var canExecuteResult = canExecuteEvaluator.Evaluate(context, effectSpec, includeValidTargets: !hasTributeComposition);
        if (!canExecuteResult.CanExecute)
        {
            return canExecuteResult;
        }

        if (hasTributeComposition)
        {
            var materialTargets = targetResolver.ResolveTargets(context, effectSpec);
            if (!TributeTargetCompositionValidator.TryValidateMaterialAvailability(
                    context,
                    effectSpec,
                    materialTargets,
                    out var materialAvailabilityError))
            {
                return new CanExecuteResult
                {
                    CanExecute = false,
                    FailedConditions = [materialAvailabilityError],
                };
            }
        }

        return canExecuteResult;
    }

    public IReadOnlyList<GameEffectTargetReference> GetValidTargets(GameCardEffectContext context)
    {
        var effectSpec = effectSpecResolver.Resolve(context, RuntimeEffects.Tribute);
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
        var effectSpec = effectSpecResolver.Resolve(context, RuntimeEffects.Tribute);
        if (effectSpec is null)
        {
            return Error.Validation(
                code: "Game.Effect.TributeSummon.MissingEffectSpec",
                description: "Tribute effect is not defined on the source card.");
        }

        if (!TributeTargetCompositionValidator.TryValidateSelectedTargets(context, effectSpec, selectedTargets, out var tributeCompositionError))
        {
            return Error.Validation(
                code: "Game.Effect.TributeSummon.InvalidTargetComposition",
                description: tributeCompositionError);
        }

        var summonTargetResult = ResolveSummonTarget(context, selectedTargets);
        if (summonTargetResult.IsError)
        {
            return summonTargetResult.Errors;
        }

        var summonTarget = summonTargetResult.Value;
        var summonTargetCard = TryGetCardDefinition(context, summonTarget.CardInstanceId);
        if (summonTargetCard is not null)
        {
            // CannotBeNormalSummoned is deliberately not consulted: the flag gates the normal summon (the one
            // performed by resting the summon card) only, and a [Summon Requirements] tribute summon is a
            // special summon. It is in fact the only way the EX cards (N-003/N-005/N-014/N-022) ever reach the
            // field, so refusing it here would make this effect refuse the very cards it exists to summon.
            // SummonPlacementRules owns the placement rule; a pool that must exclude special-summon-only cards
            // is authored with a CannotBeNormalSummoned target predicate instead.
            if (!SummonPlacementRules.IsPlaceableOnCharacterField(summonTargetCard))
            {
                return Error.Validation(
                    code: "Game.Effect.TributeSummon.UnsupportedCardType",
                    description: $"Card '{summonTarget.CardInstanceId}' cannot be summoned to the character field because its type is '{summonTargetCard.Type}'.");
            }
        }

        var tributeTargets = selectedTargets.Where(target => target != summonTarget);
        var affectedCardInstanceIds = new HashSet<string>(StringComparer.Ordinal);
        var affectedPlayerIds = new HashSet<string>(StringComparer.Ordinal)
        {
            context.ActingPlayer.Id,
        };

        foreach (var tributeTarget in tributeTargets)
        {
            var tributeSourcePlayer = context.Game.State.Players.First(player => player.PlayerId == tributeTarget.PlayerId);
            var tributeSourceZone = PlayerZoneCardAccessor.GetCards(tributeTarget.Zone, tributeSourcePlayer);
            var tributeCard = tributeSourceZone.First(card => card.InstanceId == tributeTarget.CardInstanceId);

            tributeSourceZone.Remove(tributeCard);

            if (tributeTarget.Zone == PlayerZone.CharacterField)
            {
                // A tribute material leaving the field is reset like any other exit: the trashed copy must not
                // keep buffed stats or temporary effects that would leak if the same instance is summoned back.
                CharacterFieldStateRules.ApplyOnFieldExit(context.Game.State, tributeCard);
            }

            if (tributeCard.IsRevealedToBothPlayers)
            {
                tributeCard.IsRevealedToBothPlayers = false;
                tributeCard.RevealedInZone = null;
            }

            var ownerPlayer = context.Game.State.Players.First(player => player.PlayerId == tributeCard.OwnerPlayerId);
            var ownerTrashZone = PlayerZoneCardAccessor.GetCards(PlayerZone.Trash, ownerPlayer);
            // The trash pile keeps the most recently discarded card at index 0 (matching
            // GameRuntimeDeckService.MoveCardToZone) so clients can surface it as the pile's face.
            ownerTrashZone.Insert(0, tributeCard);

            affectedCardInstanceIds.Add(tributeCard.InstanceId);
            affectedPlayerIds.Add(tributeSourcePlayer.PlayerId);
            affectedPlayerIds.Add(ownerPlayer.PlayerId);
        }

        var summoningPlayer = context.Game.State.Players.First(player => player.PlayerId == context.ActingPlayer.Id);
        var summonSourcePlayer = context.Game.State.Players.First(player => player.PlayerId == summonTarget.PlayerId);
        var summonSourceZone = PlayerZoneCardAccessor.GetCards(summonTarget.Zone, summonSourcePlayer);
        var summonedCard = summonSourceZone.First(card => card.InstanceId == summonTarget.CardInstanceId);

        summonSourceZone.Remove(summonedCard);

        if (summonedCard.IsRevealedToBothPlayers)
        {
            summonedCard.IsRevealedToBothPlayers = false;
            summonedCard.RevealedInZone = null;
        }

        var summoningPlayerField = PlayerZoneCardAccessor.GetCards(PlayerZone.CharacterField, summoningPlayer);
        // Entering the character field is a fresh placement (see CharacterFieldStateRules): the summoned card
        // cannot keep stat overrides, damage, granted keywords or temporary effects from a previous stint, and it
        // lands in the standing pose with a fresh summon-turn marker.
        CharacterFieldStateRules.ApplyOnFieldEntry(context.Game.State, summonedCard, context.Game.State.TurnNumber);
        summonedCard.ControllerPlayerId = summoningPlayer.PlayerId;
        summoningPlayerField.Add(summonedCard);

        affectedCardInstanceIds.Add(summonedCard.InstanceId);
        affectedPlayerIds.Add(summonSourcePlayer.PlayerId);

        var mutationResult = EmitMutation(
            context,
            GameMutationKind.CardSummoned,
            affectedCardInstanceIds,
            affectedPlayerIds);

        if (mutationResult.IsError)
        {
            return mutationResult.Errors;
        }

        // The tribute-summoned card is on the field now, so its mandatory "[On Summon]" effects run. The
        // depth carried by the summoning chain bounds nested triggering summons, and a failing trigger chain
        // is logged rather than returned: the summon already happened.
        RunOnSummonEffects(context, [summonedCard]);

        return Result.Success;
    }

    private void RunOnSummonEffects(GameCardEffectContext context, IReadOnlyList<CardInstance> summonedCards)
    {
        var sequentialEffectExecutor = serviceProvider?.GetService<IGameSequentialEffectExecutor>();
        if (sequentialEffectExecutor is null)
        {
            return;
        }

        var triggerDepth = GameTriggeredEffectRunner.ResolveTriggerDepth(context.Arguments);
        foreach (var summonedCard in summonedCards)
        {
            GameTriggeredEffectRunner.ExecuteAutomaticOnSummonEffects(
                context.Game,
                context.ActingPlayer.Id,
                summonedCard,
                sequentialEffectExecutor,
                triggerDepth);
        }
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

    private static ErrorOr<GameEffectTargetReference> ResolveSummonTarget(
        GameCardEffectContext context,
        IReadOnlyList<GameEffectTargetReference> selectedTargets)
    {
        if (selectedTargets.Count == 0)
        {
            return Error.Validation(
                code: "Game.Effect.TributeSummon.MissingSummonTarget",
                description: "At least one target is required for tribute summon.");
        }

        if (context.Arguments.TryGetValue(SummonTargetIdArgumentKey, out var summonTargetId)
            && !string.IsNullOrWhiteSpace(summonTargetId))
        {
            var argumentTarget = selectedTargets.FirstOrDefault(target =>
                string.Equals(target.CardInstanceId, summonTargetId, StringComparison.Ordinal));

            if (argumentTarget is not null)
            {
                return argumentTarget;
            }

            return Error.Validation(
                code: "Game.Effect.TributeSummon.InvalidSummonTarget",
                description: $"Summon target '{summonTargetId}' is not in selected targets.");
        }

        var selectedZones = selectedTargets
            .Select(target => target.Zone)
            .Distinct()
            .ToList();

        if (selectedZones.Count > 1)
        {
            return Error.Validation(
                code: "Game.Effect.TributeSummon.SummonTargetIdRequired",
                description: "summonTargetId argument is required when selected tribute/summon targets span multiple zones.");
        }

        var nonFieldTargets = selectedTargets
            .Where(target => target.Zone != PlayerZone.CharacterField)
            .ToList();

        if (nonFieldTargets.Count == 1)
        {
            return nonFieldTargets[0];
        }

        if (selectedTargets.Count == 1)
        {
            return selectedTargets[0];
        }

        return Error.Validation(
            code: "Game.Effect.TributeSummon.AmbiguousSummonTarget",
            description: "Could not infer summon target from selected targets. Provide summonTargetId argument.");
    }

    private static Card? TryGetCardDefinition(GameCardEffectContext context, string cardInstanceId)
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
            return null;
        }

        return context.Game.State.CardDefinitions.TryGetValue(cardInstance.CardDefinitionId, out var cardDefinition)
            ? cardDefinition
            : null;
    }
}
