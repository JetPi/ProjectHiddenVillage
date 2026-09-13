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

        return playerZone switch
        {
            PlayerZone.Hand =>
                CanUseHandCardActions(card, state)
                    ? BuildHandAvailableActions(card, state)
                    : [],

            PlayerZone.SupportZone =>
                CanUseSupportCardActions(card, state)
                    ? BuildSupportAvailableActions(card, state)
                    : [],

            // Evaluated lazily: only cards already on the character field can declare battle
            // actions, and CanDeclareBattleAction relies on field-entry state.
            PlayerZone.CharacterField => BuildBattleActionOptions(card, state),

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
            return IsSamePlayerId(state.ActivePlayerId, card.ControllerPlayerId);
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
}
