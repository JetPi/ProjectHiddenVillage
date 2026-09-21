using ErrorOr;
using ProjectHiddenVillage.Server.Engine;
using ProjectHiddenVillage.Server.Engine.Interfaces;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public static partial class GameStateResponseMapper
{
    private static IReadOnlyList<GameActionOptionResponse> BuildHandAvailableActions(CardInstance card, GameState state)
    {
        if (!state.CardDefinitions.TryGetValue(card.CardDefinitionId, out var cardDefinition))
        {
            return [];
        }

        if (cardDefinition.Type is CardType.Chakra or CardType.Summon or CardType.Leader)
        {
            return [];
        }

        var actions = new List<GameActionOptionResponse>();
        var summonReady = state.IsSummonCardReady(card.ControllerPlayerId);

        if (cardDefinition.CannotBeNormalSummoned)
        {
            var (specialSummonAllowed, disabledReason) = EvaluateSummonRequirementAvailability(state, card, cardDefinition);
            actions.Add(new GameActionOptionResponse(
                ActionId: $"{SummonToFieldActionPrefix}{card.InstanceId}",
                Label: "Summon",
                IsEnabled: specialSummonAllowed,
                DisabledReason: specialSummonAllowed ? null : disabledReason));
        }
        else
        {
            actions.Add(new GameActionOptionResponse(
                ActionId: $"{SummonToFieldActionPrefix}{card.InstanceId}",
                Label: "Summon",
                IsEnabled: summonReady,
                DisabledReason: summonReady ? null : "Your summon card is rested."));
        }

        if (IsSupportCapable(cardDefinition))
        {
            actions.Add(new GameActionOptionResponse(
                ActionId: $"{SetSupportActionPrefix}{card.InstanceId}",
                Label: "Set Support",
                IsEnabled: true));

            // On your own turn a support may be activated from hand or from the support area, but only
            // while its timing window is open and only if it is affordable. Without this the chip looks
            // usable and then silently does nothing when clicked.
            var (supportEnabled, supportDisabledReason) = EvaluateHandSupportAvailability(state, card, cardDefinition);
            actions.Add(new GameActionOptionResponse(
                ActionId: $"activate-support:{card.InstanceId}",
                Label: "Support",
                IsEnabled: supportEnabled,
                DisabledReason: supportEnabled ? null : supportDisabledReason));
        }

        return actions;
    }

    private static bool IsSupportCapable(Card cardDefinition)
    {
        if (cardDefinition is not CharacterCard characterCard)
        {
            return false;
        }

        return !string.IsNullOrWhiteSpace(characterCard.SupportName)
            || !string.IsNullOrWhiteSpace(characterCard.SupportEffect);
    }

    /// <summary>
    /// Whether a support-capable hand card can be activated right now. Hand-origin supports are only
    /// legal on the active player's turn, so this checks the entry effect's timing window, the
    /// once-per-turn restriction and the chakra cost - the same gates the engine enforces on submit.
    /// </summary>
    private static (bool IsEnabled, string? DisabledReason) EvaluateHandSupportAvailability(
        GameState state,
        CardInstance card,
        Card cardDefinition)
    {
        var entryEffect = SupportActivationPlanner.ResolveEntry(cardDefinition);
        if (entryEffect is null)
        {
            return (false, "This card has no support effect to activate.");
        }

        if (!SupportTimingRules.IsTimingAvailable(
            entryEffect.Timing,
            state,
            card.ControllerPlayerId,
            isFromSupportZone: false))
        {
            return (false, "Support timing is not available right now.");
        }

        var effectKey = string.IsNullOrWhiteSpace(entryEffect.Id)
            ? entryEffect.RuntimeEffectType.ToString()
            : entryEffect.Id.Trim();
        if (entryEffect.GlobalRestrictions == EffectRestrictions.OncePerTurn
            && state.IsEffectUsedThisTurn(card.ControllerPlayerId, card.InstanceId, effectKey))
        {
            return (false, EffectRestrictionMessages.OncePerTurn);
        }

        var activationCost = SupportActivationPlanner.ResolveActivationCost(entryEffect);
        var actingPlayer = state.Players.FirstOrDefault(player =>
            IsSamePlayerId(player.PlayerId, card.ControllerPlayerId));
        if (activationCost > 0 && actingPlayer is not null && actingPlayer.ResourcePool < activationCost)
        {
            return (false, $"You need {activationCost} chakra to activate this support.");
        }

        return (true, null);
    }

    private static (bool IsEnabled, string DisabledReason) EvaluateSummonRequirementAvailability(
        GameState state,
        CardInstance sourceCardInstance,
        Card cardDefinition)
    {
        if (cardDefinition.Conditions.Count == 0)
        {
            return (false, "Summon requirements are not currently satisfiable.");
        }

        var hasSummonRequirementMarker = cardDefinition.Conditions.Any(condition =>
            string.Equals(condition, EffectConditionKeywords.SummonRequirements, StringComparison.OrdinalIgnoreCase)
            || string.Equals(condition, "hasSummonTarget", StringComparison.OrdinalIgnoreCase));

        if (!hasSummonRequirementMarker)
        {
            return (false, "Summon requirements are not currently satisfiable.");
        }

        var actingPlayer = state.Players.FirstOrDefault(player =>
            IsSamePlayerId(player.PlayerId, sourceCardInstance.ControllerPlayerId));
        if (actingPlayer is null)
        {
            return (false, "Summon requirements are not currently satisfiable.");
        }

        GameInstance? evaluationGame = null;
        try
        {
            evaluationGame = new GameInstance(state);
        }
        catch (InvalidOperationException)
        {
            return (true, string.Empty);
        }

        var context = new GameCardEffectContext(
            game: evaluationGame,
            actingPlayer: new Player { Id = actingPlayer.PlayerId },
            sourceCardDefinition: cardDefinition,
            sourceCardInstance: sourceCardInstance,
            arguments: new Dictionary<string, string>(StringComparer.Ordinal),
            selectedTargets: []);

        var tributeEffectSpec = RuntimeEffectSpecResolver.Resolve(context, RuntimeEffects.Tribute);
        if (tributeEffectSpec is null)
        {
            return (false, "Summon requirements are not currently satisfiable.");
        }

        var hasTributeComposition = tributeEffectSpec.TargetRules.TributeComposition is not null;

        // includeValidTargets:false keeps the generic evaluator from comparing the (empty) target
        // selection against the effect-level target counts. For tribute compositions the summon
        // candidate is the hand card being summoned and never appears in the material selection, so
        // availability is determined by the tribute composition's distinct-material solver below.
        var canExecuteResult = LeaderEffectCanExecuteEvaluator.Evaluate(context, tributeEffectSpec, includeValidTargets: false);
        if (!canExecuteResult.CanExecute)
        {
            return (false, canExecuteResult.FailedConditions.FirstOrDefault() ?? "Summon requirements are not currently satisfiable.");
        }

        var materialTargets = EffectTargetResolver.ResolveTargets(context, tributeEffectSpec);

        if (hasTributeComposition
            && !TributeTargetCompositionValidator.TryValidateMaterialAvailability(
                context,
                tributeEffectSpec,
                materialTargets,
                out var materialAvailabilityError))
        {
            return (false, materialAvailabilityError);
        }

        if (materialTargets.Count == 0)
        {
            return (false, "No valid tribute targets available.");
        }

        return (true, string.Empty);
    }
}
