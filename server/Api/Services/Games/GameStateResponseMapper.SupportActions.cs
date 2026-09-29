using ErrorOr;
using ProjectHiddenVillage.Server.Engine;
using ProjectHiddenVillage.Server.Engine.Interfaces;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public static partial class GameStateResponseMapper
{
    private static IReadOnlyList<GameActionOptionResponse> BuildSupportAvailableActions(CardInstance card, GameState state)
    {
        // A support cannot be activated twice inside the same chain, so a card whose own activation is
        // still queued offers no support action at all: the button must be gone, not merely disabled.
        if (SupportTimingRules.IsCardPendingOnResolutionStack(state, card.InstanceId))
        {
            return [];
        }

        if (!state.CardDefinitions.TryGetValue(card.CardDefinitionId, out var cardDefinition))
        {
            return [];
        }

        var primaryEffect = ResolveActivationEntryEffect(state, cardDefinition, card);
        if (primaryEffect is null)
        {
            return
            [
                new GameActionOptionResponse(
                    ActionId: $"activate-support:{card.InstanceId}",
                    Label: EffectTiming.Unspecified.ToString(),
                    IsEnabled: true)
            ];
        }

        if (!SupportTimingRules.IsTimingAvailable(primaryEffect.Timing, state, card.ControllerPlayerId, isFromSupportZone: true))
        {
            return
            [
                new GameActionOptionResponse(
                    ActionId: $"activate-support:{card.InstanceId}",
                    Label: BuildEffectOptionLabel(primaryEffect),
                    IsEnabled: false,
                    DisabledReason: "Support timing is not available right now.")
            ];
        }

        var actingPlayerState = state.Players.FirstOrDefault(player =>
            string.Equals(player.PlayerId, card.ControllerPlayerId, StringComparison.Ordinal));

        if (actingPlayerState is null)
        {
            return [];
        }

        GameInstance? evaluationGame = null;
        var (isEnabled, disabledReason) = EvaluateEffectAvailability(
            state,
            actingPlayerState,
            cardDefinition,
            card,
            primaryEffect,
            ref evaluationGame);

        return
        [
            new GameActionOptionResponse(
                ActionId: $"activate-support:{card.InstanceId}",
                Label: BuildEffectOptionLabel(primaryEffect),
                IsEnabled: isEnabled,
                DisabledReason: disabledReason)
        ];
    }

    /// <summary>
    /// The entry effect of a support activation in the shape the engine actually executes it.
    ///
    /// An activation replays the card's planned nodes through <see cref="SupportActivationNormalizer"/>,
    /// which turns "summon this card" (N-002/N-008/N-010/N-021: a summon-candidate rule pointing at the
    /// zone the card is activated from) into a selection-free source-card node before the engine runs it.
    /// Availability has to be evaluated on that same shape: the raw rule looks for the source card in
    /// the *hand*, so activating the very same card from the support area resolved zero valid targets
    /// and the published chip read "No valid targets available." although a submit would have executed.
    /// </summary>
    private static EffectSpec? ResolveActivationEntryEffect(GameState state, Card cardDefinition, CardInstance card)
    {
        var entryEffect = SupportActivationPlanner.ResolveEntry(cardDefinition);
        if (entryEffect is null)
        {
            return null;
        }

        return SupportActivationNormalizer.NormalizeEffect(state, cardDefinition, card, entryEffect);
    }

}
