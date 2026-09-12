using ProjectHiddenVillage.Server.Engine;
using ProjectHiddenVillage.Server.Engine.Interfaces;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

// Why a card cannot declare a battle action right now.
internal enum BattleActionRestriction
{
    None,
    FirstTurn,
    CardRested,
    CannotAttackEffect,
    EnteredFieldThisTurn,
}

// Single source of truth for battle-action legality. The response mapper publishes it as the
// per-card `Battle` availability and the engine consults it when deciding whether a main phase has
// any legal action left, so the UI and the engine can never disagree.
internal static class BattleActionRules
{
    internal static BattleActionRestriction ResolveRestriction(GameState state, CardInstance card, bool isLeader = false)
    {
        var activePlayer = state.Players.Find(player => player.PlayerId == state.ActivePlayerId);
        var currentPlayerTurn = activePlayer?.TurnCount ?? 1;

        if (currentPlayerTurn == 1)
        {
            return BattleActionRestriction.FirstTurn;
        }

        if (card.IsRested)
        {
            return BattleActionRestriction.CardRested;
        }

        if (HasCannotAttackEffect(state, card))
        {
            return BattleActionRestriction.CannotAttackEffect;
        }

        // Leaders are always on the field, so the summon-turn rule does not apply to them
        // (Rush exists only to bypass that rule and is therefore irrelevant for leaders).
        if (isLeader
            || !card.EnteredFieldTurnNumber.HasValue
            || card.EnteredFieldTurnNumber.Value != state.TurnNumber
            || HasRushKeyword(state, card))
        {
            return BattleActionRestriction.None;
        }

        return BattleActionRestriction.EnteredFieldThisTurn;
    }

    internal static bool CanDeclareBattleAction(GameState state, CardInstance card, bool isLeader = false)
    {
        return ResolveRestriction(state, card, isLeader) == BattleActionRestriction.None;
    }

    internal static string ResolveRestrictionCode(BattleActionRestriction restriction)
    {
        return restriction switch
        {
            BattleActionRestriction.FirstTurn => "BattleAction.FirstTurn",
            BattleActionRestriction.CardRested => "BattleAction.CardRested",
            BattleActionRestriction.CannotAttackEffect => "BattleAction.RestrictedByEffect",
            BattleActionRestriction.EnteredFieldThisTurn => "BattleAction.SummonedThisTurn",
            _ => "BattleAction.Unavailable",
        };
    }

    internal static string DescribeRestriction(BattleActionRestriction restriction)
    {
        return restriction switch
        {
            BattleActionRestriction.FirstTurn => "Cannot declare battle action because it is the first turn.",
            BattleActionRestriction.CardRested => "Cannot declare battle action because the card is rested.",
            BattleActionRestriction.CannotAttackEffect => "Cannot declare battle action because the card is under an effect that restricts it.",
            BattleActionRestriction.EnteredFieldThisTurn => "Cannot declare battle action the turn that the card entered the field.",
            _ => "Battle action is not available.",
        };
    }

    internal static bool HasRushKeyword(GameState state, CardInstance card)
    {
        var effectiveKeywords = CardRuntimeEffectStateService.ResolveEffectiveKeywords(state, card);

        if (effectiveKeywords.Any(keyword =>
            string.Equals(keyword, EffectConditionKeywords.Rush, StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }

        if (!state.CardDefinitions.TryGetValue(card.CardDefinitionId, out var definition))
        {
            return false;
        }

        return definition.Conditions.Any(condition =>
            string.Equals(condition, EffectConditionKeywords.Rush, StringComparison.OrdinalIgnoreCase));
    }

    private static bool HasCannotAttackEffect(GameState state, CardInstance card)
    {
        return CardRuntimeEffectStateService
            .ResolveEffectiveKeywords(state, card)
            .Any(keyword => string.Equals(
                keyword,
                FreezeCardEffect.CannotAttackKeyword,
                StringComparison.OrdinalIgnoreCase));
    }
}
