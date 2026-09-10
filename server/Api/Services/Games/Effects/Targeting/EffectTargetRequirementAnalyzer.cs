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
}
