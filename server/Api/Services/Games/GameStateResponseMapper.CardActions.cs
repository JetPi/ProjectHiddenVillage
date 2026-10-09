using ErrorOr;
using ProjectHiddenVillage.Server.Engine;
using ProjectHiddenVillage.Server.Engine.Interfaces;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public static partial class GameStateResponseMapper
{
    private static IReadOnlyList<GameActionOptionResponse> BuildCardAvailableActions(
        CardInstance card,
        PlayerZone playerZone,
        GameState? state,
        GamePrompt? pendingPrompt,
        bool isRequestingPlayer)
    {
        if (!isRequestingPlayer || state is null)
        {
            return [];
        }

        if (pendingPrompt is not null)
        {
            return [];
        }

        // A finished game has no card actions left, wherever the card sits.
        if (GameEndRules.IsGameOver(state))
        {
            return [];
        }

        return playerZone switch
        {
            PlayerZone.Hand =>
                CanUseHandCardActions(card, state) && !SupportTimingRules.HasPendingSupportActivation(state)
                    ? BuildHandAvailableActions(card, state)
                    : [],

            PlayerZone.SupportZone =>
                CanUseSupportCardActions(card, state)
                    ? BuildSupportAvailableActions(card, state)
                    : [],

            // Evaluated lazily: only cards already on the character field can declare battle actions, and
            // CanDeclareBattleAction relies on field-entry state. A battlefield character also publishes its
            // own abilities (N-011's "[Activate: Main]"), exactly like a leader does; both are suppressed
            // while a support activation waits for responses, which is what the engine's window guard does.
            PlayerZone.CharacterField => SupportTimingRules.HasPendingSupportActivation(state)
                ? []
                : BuildCharacterFieldAvailableActions(card, state),

            _ => []
        };
    }

    private static bool CanUseHandCardActions(CardInstance card, GameState state)
    {
        return state.Phase == GamePhase.MainPhase
            && IsSamePlayerId(state.ActivePlayerId, card.ControllerPlayerId);
    }

    private static bool CanUseSupportCardActions(CardInstance card, GameState state)
    {
        if (state.Phase == GamePhase.MainPhase)
        {
            if (IsSamePlayerId(state.ActivePlayerId, card.ControllerPlayerId))
            {
                return true;
            }

            // A MainPhase support activation opens a reaction window: the opponent may respond from
            // their support area with a Support Activated card.
            return SupportTimingRules.HasPendingSupportActivation(state)
                && IsSamePlayerId(state.PriorityPlayerId, card.ControllerPlayerId);
        }

        if (state.Phase is GamePhase.AttackDeclaration or GamePhase.BlockerDeclaration)
        {
            return !IsSamePlayerId(state.ActivePlayerId, card.ControllerPlayerId);
        }

        return state.Phase == GamePhase.ActionStep
            && IsSamePlayerId(state.PriorityPlayerId, card.ControllerPlayerId);
    }

    private static bool CanUseBattleCardActions(CardInstance card, GameState state)
    {
        return state.Phase == GamePhase.MainPhase
            && IsSamePlayerId(state.ActivePlayerId, card.ControllerPlayerId);
    }

    /// <summary>
    /// A battlefield card's published options: its own abilities (the same builder the leader uses, with the
    /// card as the source instance) followed by the always-published Battle action. Ability options are only
    /// produced when their timing window is open, so a card without an activatable ability simply shows Battle.
    /// </summary>
    private static IReadOnlyList<GameActionOptionResponse> BuildCharacterFieldAvailableActions(
        CardInstance card,
        GameState state)
    {
        var actions = new List<GameActionOptionResponse>();
        var controller = state.Players.FirstOrDefault(player =>
            IsSamePlayerId(player.PlayerId, card.ControllerPlayerId));

        if (controller is not null
            && state.CardDefinitions.TryGetValue(card.CardDefinitionId, out var definition))
        {
            actions.AddRange(BuildCardAbilityOptions(
                state,
                controller,
                definition,
                sourceCardInstance: card,
                sourceCardInstanceId: card.InstanceId,
                actionPrefix: CharacterAbilityActionPrefix));
        }

        actions.AddRange(BuildBattleActionOptions(card, state));

        return actions;
    }
}
