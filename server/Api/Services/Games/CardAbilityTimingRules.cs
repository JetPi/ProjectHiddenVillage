namespace ProjectHiddenVillage.Server.Api.Services.Games;

/// <summary>
/// Single source of truth for when a card's own <b>ability</b> may be activated - the leader's
/// <c>leader-effect:</c> options and a battlefield character's <c>character-ability:</c> options. The response
/// mapper publishes the availability the client renders and the engine enforces it on submit, so both must
/// agree; the switch used to be duplicated verbatim on both sides.
///
/// Support activations keep their own rules (<see cref="SupportTimingRules"/>): those also depend on the zone
/// the card is activated from and on the reaction window an activation opens, which an ability never does.
/// </summary>
public static class CardAbilityTimingRules
{
    public static bool IsAbilityTimingAvailable(EffectTiming timing, GameState state, string actingPlayerId)
    {
        var isActivePlayer = GameStatePlayerResolver.IsSamePlayerId(state.ActivePlayerId, actingPlayerId);
        var isPriorityPlayer = GameStatePlayerResolver.IsSamePlayerId(state.PriorityPlayerId, actingPlayerId);

        return timing switch
        {
            EffectTiming.ActivateMain or EffectTiming.DuringYourMain =>
                state.Phase == GamePhase.MainPhase && isActivePlayer,
            EffectTiming.WhenAttacking =>
                state.IsAttackDeclarationWindow() && isActivePlayer,
            EffectTiming.YourTurn => isActivePlayer,
            EffectTiming.Quick or EffectTiming.SupportActivated =>
                state.Phase == GamePhase.ActionStep && isPriorityPlayer,
            EffectTiming.DuringOpponentAttack =>
                state.HasPendingAttack && state.Phase == GamePhase.ActionStep && !isActivePlayer,
            _ => false,
        };
    }
}
