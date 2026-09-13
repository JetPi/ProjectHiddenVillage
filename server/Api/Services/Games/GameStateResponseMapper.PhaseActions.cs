using ErrorOr;
using ProjectHiddenVillage.Server.Engine;
using ProjectHiddenVillage.Server.Engine.Interfaces;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public static partial class GameStateResponseMapper
{
    private static IReadOnlyList<GameActionOptionResponse> BuildAvailableActions(
        GameState state,
        GamePhaseData phaseData,
        string requestingPlayerId,
        GamePrompt? pendingPrompt)
    {
        if (pendingPrompt is not null)
        {
            var isAwaitingRequestingPlayer = IsSamePlayerId(
                pendingPrompt.RequestedPlayerId,
                requestingPlayerId);

            if (!isAwaitingRequestingPlayer)
            {
                return [];
            }

            return pendingPrompt.Options.ConvertAll(option =>
                new GameActionOptionResponse(
                    ActionId: $"resolve-prompt:{option}",
                    Label: option,
                    IsEnabled: true));
        }

        var actions = new List<GameActionOptionResponse>();
        var isRequestingPlayerActive = IsSamePlayerId(state.ActivePlayerId, requestingPlayerId);
        var isRequestingPlayerPriority = IsSamePlayerId(state.PriorityPlayerId, requestingPlayerId);

        AddActivePlayerPhaseOptionActions(actions, phaseData, isRequestingPlayerActive);
        AddActionStepPriorityActions(actions, state.Phase, isRequestingPlayerPriority);
        AddOptionalAttackEffectChoiceActions(actions, state, requestingPlayerId);
        AddDefaultAdvancePhaseAction(actions, phaseData, isRequestingPlayerActive);

        return actions;
    }

    private static void AddActivePlayerPhaseOptionActions(
        List<GameActionOptionResponse> actions,
        GamePhaseData phaseData,
        bool isRequestingPlayerActive)
    {
        if (!isRequestingPlayerActive || phaseData.AvailablePhaseOptions.Count == 0)
        {
            return;
        }

        if (phaseData.PhaseName == GamePhase.ActionStep)
        {
            return;
        }

        actions.AddRange(phaseData.AvailablePhaseOptions.Select(MapPhaseOptionToAction));
    }

    private static GameActionOptionResponse MapPhaseOptionToAction(string option)
    {
        return option switch
        {
            "endPhase" => new GameActionOptionResponse(
                ActionId: "turn-end",
                Label: "End Turn",
                IsEnabled: true),
            "declareAttack" => new GameActionOptionResponse(
                ActionId: "declare-attack",
                Label: "Declare Attack",
                IsEnabled: true),
            _ => new GameActionOptionResponse(
                ActionId: option,
                Label: option,
                IsEnabled: true)
        };
    }

    private static void AddActionStepPriorityActions(
        List<GameActionOptionResponse> actions,
        GamePhase phase,
        bool isRequestingPlayerPriority)
    {
        if (phase != GamePhase.ActionStep || !isRequestingPlayerPriority)
        {
            return;
        }

        actions.Add(new GameActionOptionResponse(ActionId: "pass-turn", Label: "Pass Turn", IsEnabled: true));
        actions.Add(new GameActionOptionResponse(ActionId: "declare-action", Label: "Declare Action", IsEnabled: true));
    }

    private static void AddDefaultAdvancePhaseAction(
        List<GameActionOptionResponse> actions,
        GamePhaseData phaseData,
        bool isRequestingPlayerActive)
    {
        if (!isRequestingPlayerActive || phaseData.AvailablePhaseOptions.Count > 0)
        {
            return;
        }

        actions.Add(new GameActionOptionResponse(ActionId: "advance-phase", Label: "Advance Phase", IsEnabled: true));
    }

    private static void AddOptionalAttackEffectChoiceActions(
        List<GameActionOptionResponse> actions,
        GameState state,
        string requestingPlayerId)
    {
        if (state.Phase != GamePhase.AttackDeclaration)
        {
            return;
        }

        if (!IsSamePlayerId(state.PendingAttackOptionalEffectPlayerId, requestingPlayerId)
            || string.IsNullOrWhiteSpace(state.PendingAttackOptionalEffectSourceCardInstanceId))
        {
            return;
        }

        var sourceCardInstanceId = state.PendingAttackOptionalEffectSourceCardInstanceId;
        actions.Add(new GameActionOptionResponse(
            ActionId: $"{ResolveOptionalAttackEffectActionPrefix}{sourceCardInstanceId}:yes",
            Label: "Want to activate On Attack effect?",
            IsEnabled: true));
        actions.Add(new GameActionOptionResponse(
            ActionId: $"{ResolveOptionalAttackEffectActionPrefix}{sourceCardInstanceId}:no",
            Label: "Skip On Attack Effect",
            IsEnabled: true));
    }
}
