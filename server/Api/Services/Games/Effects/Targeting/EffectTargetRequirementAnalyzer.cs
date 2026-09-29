namespace ProjectHiddenVillage.Server.Api.Services.Games;

/// <summary>
/// Inspects an effect's own actions to decide whether it can satisfy the target requirement itself.
/// Example: "draw 1 card, then place 1 card from your hand on top of your deck" - the draw puts a card
/// into the zone the following move consumes, so the effect must stay usable (and executable) even when
/// the player cannot select anything up front.
/// </summary>
internal static class EffectTargetRequirementAnalyzer
{
    public const string NoCardsToDrawFailureMessage = "No cards available to draw.";

    public static bool HasSelfSuppliedTargets(EffectSpec effectSpec)
    {
        var actions = effectSpec.MoveCardActions;

        for (var index = 0; index < actions.Count; index++)
        {
            var action = actions[index];

            if (action.Operation != MoveCardOperationType.Move || action.SourceZone != PlayerZone.Hand)
            {
                continue;
            }

            for (var earlierIndex = 0; earlierIndex < index; earlierIndex++)
            {
                if (actions[earlierIndex].Operation == MoveCardOperationType.Draw)
                {
                    return true;
                }
            }
        }

        return false;
    }

    /// <summary>
    /// True when the effect can supply its own target right now: the draw it performs before the move
    /// needs at least one card left in the deck.
    /// </summary>
    public static bool CanSelfSupplyTargets(GameCardEffectContext context, EffectSpec effectSpec)
    {
        if (!HasSelfSuppliedTargets(effectSpec))
        {
            return false;
        }

        var playerState = context.Game.State.Players.FirstOrDefault(player =>
            string.Equals(player.PlayerId, context.ActingPlayer.Id, StringComparison.Ordinal));

        return playerState is not null && playerState.Deck.Count > 0;
    }

    /// <summary>
    /// True when the effect can actually ask the player for a selection. This is the single home for the
    /// question the availability gate (<c>GameStateResponseMapper.EvaluateEffectAvailability</c>) and the
    /// engine's target-count bounds (<c>GameEffectCanExecuteEvaluator.TryResolveTargetCountBounds</c>) both
    /// ask, so they can never disagree.
    ///
    /// A node that supplies its own targets - <c>None</c>/<c>SourceCard</c> execution sources, own-leader
    /// modifications, own-state effects - must never demand a selection, "because there is nothing for the
    /// player to pick". Neither do authored counts on such a node (N-008's <c>Interrupt Attack</c> carries a
    /// leftover <c>exactTargetCount</c>) nor a bare default <c>Selected Targets</c> source nobody authored a
    /// rule for (N-012's <c>recovery</c>: "recover 5 chakra", whose audience is its Target Range). Both shapes
    /// used to make the ability read "No valid targets available." and become unplayable.
    /// </summary>
    public static bool RequiresPlayerSelection(EffectSpec effectSpec)
    {
        if (effectSpec.TargetRules.Rules.Count > 0)
        {
            return true;
        }

        if (effectSpec.AttributeModifications.Any(modification =>
            modification.TargetType == AttributeModificationTargetType.SelectedTargets))
        {
            return true;
        }

        if (effectSpec.KeywordModifications.Any(modification =>
            modification.TargetType == KeywordModificationTargetType.SelectedTargets))
        {
            return true;
        }

        if (effectSpec.MoveCardActions.Any(action =>
            action.Operation == MoveCardOperationType.Move && action.SourceZone is not null))
        {
            return true;
        }

        if (effectSpec.ExecutionTargetSource != EffectExecutionTargetSource.SelectedTargets)
        {
            return false;
        }

        // Nothing above consumes a selection, so only an explicitly declared count keeps the implicit
        // "choose 1" alive - the same convention TryResolveTargetCountBounds documents.
        return effectSpec.TargetRules.ExactTargetCount.HasValue
            || effectSpec.TargetRules.MinimumTargetCount.HasValue
            || effectSpec.TargetRules.MaximumTargetCount.HasValue;
    }
}
