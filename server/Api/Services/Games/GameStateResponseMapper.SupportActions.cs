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

        var primaryEffect = cardDefinition.Effects.FirstOrDefault();
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

}
