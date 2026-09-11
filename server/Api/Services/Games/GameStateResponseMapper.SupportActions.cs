using ErrorOr;
using ProjectHiddenVillage.Server.Engine;
using ProjectHiddenVillage.Server.Engine.Interfaces;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public static partial class GameStateResponseMapper
{
    private static IReadOnlyList<GameActionOptionResponse> BuildSupportAvailableActions(CardInstance card, GameState state)
    {
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

        if (!IsSupportEffectTimingAvailable(primaryEffect.Timing, state, card.ControllerPlayerId, isFromSupportZone: true))
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

    private static bool IsSupportEffectTimingAvailable(
        EffectTiming timing,
        GameState state,
        string actingPlayerId,
        bool isFromSupportZone)
    {
        var isActivePlayer = IsSamePlayerId(state.ActivePlayerId, actingPlayerId);
        var isPriorityPlayer = IsSamePlayerId(state.PriorityPlayerId, actingPlayerId);

        if (!isActivePlayer && !isFromSupportZone)
        {
            return false;
        }

        return timing switch
        {
            EffectTiming.Unspecified => isActivePlayer
                ? state.Phase is GamePhase.MainPhase or GamePhase.ActionStep
                : state.Phase is GamePhase.AttackDeclaration or GamePhase.BlockerDeclaration or GamePhase.ActionStep,
            EffectTiming.ActivateMain or EffectTiming.DuringYourMain =>
                isActivePlayer && state.Phase == GamePhase.MainPhase,
            EffectTiming.WhenAttacking =>
                isActivePlayer && state.IsAttackDeclarationWindow(),
            EffectTiming.YourTurn =>
                isActivePlayer,
            EffectTiming.Quick =>
                isActivePlayer
                    ? state.Phase == GamePhase.ActionStep && isPriorityPlayer
                    : state.HasPendingAttack && state.Phase == GamePhase.ActionStep && isPriorityPlayer,
            EffectTiming.SupportActivated =>
                state.Phase == GamePhase.ActionStep && isPriorityPlayer,
            EffectTiming.DuringOpponentAttack =>
                !isActivePlayer && state.HasPendingAttack && state.Phase == GamePhase.ActionStep,
            _ => false,
        };
    }
}
