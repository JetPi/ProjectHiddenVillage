namespace ProjectHiddenVillage.Server.Api.Services.Games;

/// <summary>
/// Single source of truth for when a support effect may be activated. The mapper publishes the
/// availability the client renders and the engine enforces it on submit, so both must agree -
/// every timing/zone decision belongs here.
///
/// Rules (see <c>.clinerules/00-game-rules.md</c>):
/// - On your own turn a support effect can be activated from hand or from the support area, but the
///   effect's own timing still has to be legal. <see cref="EffectTiming.Quick"/> is the exception that
///   is legal at any point on your turn ("You can activate this card from your hand at ANY TIME").
/// - On the opponent's turn supports must be played from the support area and only inside the attack
///   support cut-in window (Quick / Support Activated / During Opponent's Attack).
/// - <see cref="EffectTiming.SupportActivated"/> is a reaction to a support being activated, whichever
///   window that happened in: the attack cut-in window *and* a MainPhase activation both open a
///   reaction window. The supporter reacting must do so from their support area, and only its opponent
///   (never the player who activated) may react to an activation.
/// </summary>
public static class SupportTimingRules
{
    /// <summary>
    /// True while an activated support is waiting for responses. Both window kinds are represented by
    /// the pending activation entries on the resolution stack.
    /// </summary>
    public static bool HasPendingSupportActivation(GameState state)
    {
        ArgumentNullException.ThrowIfNull(state);

        return state.EffectResolutionStack.Any(entry => !string.IsNullOrWhiteSpace(entry.ActivatedEffectId));
    }

    /// <summary>The player who activated the most recent pending support, if any.</summary>
    public static string? ResolveLatestActivatorPlayerId(GameState state)
    {
        ArgumentNullException.ThrowIfNull(state);

        for (var index = state.EffectResolutionStack.Count - 1; index >= 0; index--)
        {
            var entry = state.EffectResolutionStack[index];
            if (!string.IsNullOrWhiteSpace(entry.ActivatedEffectId))
            {
                return entry.SourcePlayerId;
            }
        }

        return null;
    }

    /// <summary>
    /// True while this card's own support activation is still waiting on the resolution stack. A support
    /// cannot be activated twice inside the same chain: the mapper stops publishing its support action (so
    /// the button is gone, not merely disabled) and the engine refuses the submit. The card leaves the stack
    /// as soon as the window closes - once spent, a support is gone from the support area too.
    /// </summary>
    public static bool IsCardPendingOnResolutionStack(GameState state, string? cardInstanceId)
    {
        ArgumentNullException.ThrowIfNull(state);

        if (string.IsNullOrWhiteSpace(cardInstanceId))
        {
            return false;
        }

        return state.EffectResolutionStack.Any(entry =>
            !string.IsNullOrWhiteSpace(entry.ActivatedEffectId)
            && string.Equals(entry.SourceCardInstanceId, cardInstanceId, StringComparison.Ordinal));
    }

    /// <summary>
    /// On the active player's turn a support may originate from hand or the support area; on the
    /// opponent's turn only from the support area.
    /// </summary>
    public static bool IsZoneAllowed(GameState state, string? actingPlayerId, bool isFromSupportZone)
    {
        if (isFromSupportZone)
        {
            return true;
        }

        return GameStatePlayerResolver.IsSamePlayerId(state.ActivePlayerId, actingPlayerId);
    }

    public static bool IsTimingAvailable(
        EffectTiming timing,
        GameState state,
        string? actingPlayerId,
        bool isFromSupportZone)
    {
        var isActivePlayer = GameStatePlayerResolver.IsSamePlayerId(state.ActivePlayerId, actingPlayerId);
        var isPriorityPlayer = GameStatePlayerResolver.IsSamePlayerId(state.PriorityPlayerId, actingPlayerId);

        if (!IsZoneAllowed(state, actingPlayerId, isFromSupportZone))
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
            EffectTiming.Quick => isActivePlayer
                ? IsYourTurnQuickWindow(state, isPriorityPlayer)
                : state.HasPendingAttack && state.Phase == GamePhase.ActionStep && isPriorityPlayer,
            EffectTiming.SupportActivated =>
                isPriorityPlayer
                && IsSupportReactionWindowOpen(state)
                && IsRespondingToOpponentActivation(state, actingPlayerId),
            EffectTiming.DuringOpponentAttack =>
                !isActivePlayer && state.HasPendingAttack && state.Phase == GamePhase.ActionStep,
            _ => false,
        };
    }

    private static bool IsYourTurnQuickWindow(GameState state, bool isPriorityPlayer)
    {
        // Quick is playable from hand at any point on your own turn; inside a cut-in window the
        // priority holder is the one allowed to act.
        return state.Phase == GamePhase.MainPhase
            || (state.Phase == GamePhase.ActionStep && isPriorityPlayer);
    }

    private static bool IsSupportReactionWindowOpen(GameState state)
    {
        return HasPendingSupportActivation(state)
            && state.Phase is GamePhase.MainPhase or GamePhase.ActionStep;
    }

    private static bool IsRespondingToOpponentActivation(GameState state, string? actingPlayerId)
    {
        var activatorPlayerId = ResolveLatestActivatorPlayerId(state);
        return activatorPlayerId is not null
            && !GameStatePlayerResolver.IsSamePlayerId(activatorPlayerId, actingPlayerId);
    }
}
