using ProjectHiddenVillage.Server;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

/// <summary>
/// Single home for resetting a card's runtime state when it leaves or enters a Character Field.
///
/// A card instance keeps its identity (name, definition, owner) across zone changes, so every value an
/// effect stamped onto it while it was on the field survives a round trip through the trash unless it is
/// explicitly cleared. A card that leaves play and is later summoned back must therefore be a *fresh* card:
/// its stat overrides (a permanent "+5 power"), its accumulated damage (<c>CurrentHealth</c>), any runtime
/// keywords it was granted, and the summon-effect suppression flag all have to be dropped - and so do the
/// duration-scoped <see cref="GameState.AppliedCardEffects"/> entries that target it (a "this turn" buff must
/// not re-apply when the very same instance is re-summoned inside the same turn).
///
/// Both transitions use this class so the entry and exit reset cannot drift apart. Callers that place a card
/// by manipulating a zone list directly (the summon effects) and callers that route through
/// <c>GameRuntimeDeckService.MoveCardToZone</c> all consult it.
/// </summary>
internal static class CharacterFieldStateRules
{
    /// <summary>
    /// Prepares a card to sit on the character field as a brand-new instance: clears every runtime value and
    /// the applied effects that targeted it, then stamps the summon-turn marker and stands it up face-up.
    /// </summary>
    internal static void ApplyOnFieldEntry(GameState state, CardInstance card, int enterTurnNumber)
    {
        ArgumentNullException.ThrowIfNull(state);
        ArgumentNullException.ThrowIfNull(card);

        ClearRuntimeValues(card);
        RemoveAppliedEffectsTargeting(state, card.InstanceId);

        card.EnteredFieldTurnNumber = enterTurnNumber;
        card.IsRested = false;
        card.IsFaceUp = true;
    }

    /// <summary>
    /// Clears the same runtime values when a card leaves the character field, so a copy sitting in the trash,
    /// hand or deck no longer reports buffed stats and any temporary effect aimed at it is dispelled instead of
    /// waiting to re-apply on the next stint on the field.
    /// </summary>
    internal static void ApplyOnFieldExit(GameState state, CardInstance card)
    {
        ArgumentNullException.ThrowIfNull(state);
        ArgumentNullException.ThrowIfNull(card);

        ClearRuntimeValues(card);
        RemoveAppliedEffectsTargeting(state, card.InstanceId);
    }

    private static void ClearRuntimeValues(CardInstance card)
    {
        card.PowerOverride = null;
        card.DamageOverride = null;
        card.HealthOverride = null;
        card.CurrentHealth = null;
        card.RuntimeKeywords.Clear();
        card.EffectsSuppressedWhileOnField = false;
        card.IsRested = false;
    }

    private static void RemoveAppliedEffectsTargeting(GameState state, string cardInstanceId)
    {
        if (state.AppliedCardEffects.Count == 0)
        {
            return;
        }

        state.AppliedCardEffects.RemoveAll(effect =>
            string.Equals(effect.TargetCardInstanceId, cardInstanceId, StringComparison.Ordinal));
    }
}
