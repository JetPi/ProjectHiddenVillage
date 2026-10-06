namespace ProjectHiddenVillage.Server.Api.Services.Games;

/// <summary>
/// Single source of truth for a card's own <b>ability</b> - the leader's <c>leader-effect:</c> options and a
/// battlefield character's <c>character-ability:</c> options. The response mapper publishes the options the
/// client renders and the engine enforces them on submit, so both must agree; the switch used to be duplicated
/// verbatim on both sides.
///
/// It owns two questions:
/// <list type="bullet">
/// <item>which authored nodes are independently activatable abilities at all
/// (<see cref="IsIndependentlyActivatableAbility"/>, the mapper's chip filter and the engine's submit guard), and</item>
/// <item>when such an ability may be activated (<see cref="IsAbilityTimingAvailable"/>).</item>
/// </list>
///
/// Support activations keep their own rules (<see cref="SupportTimingRules"/>): those also depend on the zone
/// the card is activated from and on the reaction window an activation opens, which an ability never does.
/// </summary>
public static class CardAbilityTimingRules
{
    /// <summary>
    /// Whether an authored node is an ability the card's controller activates on its own - the only shape that
    /// may be published as a <c>leader-effect:</c> / <c>character-ability:</c> chip and executed through that
    /// path.
    ///
    /// Four shapes are never independently activatable - three are engine-driven and one belongs to another
    /// activation path:
    /// <list type="bullet">
    /// <item>a subordinate node, which is a step of another ability's chain ("draw 1 card, then place 1 card
    /// from your hand on top of your deck") and is reached through its parent's success branch;</item>
    /// <item>a passive (<c>PassiveMode != None</c>, e.g. N-007's conditional Rush), which the engine resolves
    /// whenever a mutation triggers it and which has no activation window of its own;</item>
    /// <item>the card's <b>summon requirement</b> - the <c>Tribute</c> node behind "[Summon Requirements]
    /// Place 1 of your Characters in your trash" (N-003/N-005/N-014/N-022). It is authored as a root with a
    /// MainPhase timing, but it is paid by the summon action's own flow (<c>summon-to-field</c> → tribute
    /// materials → <c>[On Summon]</c> chain), never as a MainPhase ability. Publishing it as one put a
    /// "During Your Main" chip (or "Support" for N-003, whose node is authored as a Support effect type) on a
    /// special-summon card sitting on the battlefield, and a direct submit re-ran the whole summon chain.</item>
    /// <item>a <b>support effect</b> (<c>EffectType == EffectKind.Support</c>). A support is activated through
    /// the support path only (<see cref="SupportTimingRules"/> owns when and from where): from the hand on your
    /// own turn, or from the support area. Neither the character field nor a leader has a support area to
    /// activate it from, so the node must not be published as a chip for a card sitting there. Publishing it
    /// put a "Support" chip on N-015's "[During Your Main] K.O. all Characters" once the card was
    /// normal-summoned onto the character field (N-002/N-008/N-021 would have exposed their Quick /
    /// attack-interruption supports the same way).</item>
    /// </list>
    /// </summary>
    public static bool IsIndependentlyActivatableAbility(EffectSpec? effectSpec)
    {
        if (effectSpec is null)
        {
            return false;
        }

        if (effectSpec.IsSubordinate || effectSpec.PassiveMode != PassiveMode.None)
        {
            return false;
        }

        // A support effect is never an ability here: it is activated through the support path
        // (`activate-support:`), which owns when and from where it may be used (see SupportTimingRules) - from
        // the hand on your own turn, or from the support area. A card sitting on the character field (or a
        // leader) has no support area to activate it from.
        if (effectSpec.EffectType == EffectKind.Support)
        {
            return false;
        }

        // The summon-requirement marker: its runtime effect is the summon requirement the hand's
        // `summon-to-field` availability resolves, and the effect kind is the authoring vocabulary for it.
        return effectSpec.RuntimeEffectType != RuntimeEffects.Tribute
            && effectSpec.EffectType != EffectKind.SummonRequirement;
    }

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
