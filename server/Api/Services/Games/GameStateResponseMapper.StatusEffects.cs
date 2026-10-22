using ProjectHiddenVillage.Server.Engine;
using ProjectHiddenVillage.Server.Engine.Interfaces;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public static partial class GameStateResponseMapper
{
    /// <summary>
    /// Projects everything the board needs to badge a card, using the exact rules the engine plays by:
    /// Rush comes from the same helper that decides whether a freshly summoned card may attack, "Cannot
    /// Attack" from the battle restriction evaluator, and effect-immunity from the effective keyword set.
    /// The client cannot rebuild this - a printed "Rush" is void while the card's effects are suppressed.
    /// </summary>
    private static IReadOnlyList<CardStatusEffectResponse> BuildCardStatusEffects(
        GameState state,
        CardInstance card,
        bool isLeader)
    {
        var statuses = new List<CardStatusEffectResponse>(capacity: CardStatusEffectCodes.All.Length);

        // Rush only matters for battlefield cards: leaders are always on the field, so the summon-turn rule
        // (the one Rush bypasses) never applies to them.
        if (!isLeader && BattleActionRules.HasRushKeyword(state, card))
        {
            statuses.Add(new CardStatusEffectResponse(CardStatusEffectCodes.Rush));
        }

        // "Cannot attack" has to cover every reason the Battle chip can be refused, not just the keyword: the
        // chip is no longer drawn when it is unusable, so this badge is the only thing telling a player why a
        // freshly summoned, rested or frozen card stays put. Live restrictions are only evaluated for the card
        // of the player who is actually acting - the opponent's board is simply not the acting side, and
        // badging every opposing card "cannot attack" would be noise instead of information.
        var isActingCard = state.Phase == GamePhase.MainPhase
            && IsSamePlayerId(state.ActivePlayerId, card.ControllerPlayerId);
        var liveRestriction = isActingCard
            ? BattleActionRules.ResolveRestriction(state, card, isLeader)
            : BattleActionRestriction.None;

        // The keyword wins over a turn-scoped restriction when both apply: "frozen" is the durable reason, and
        // it is also the only one the opponent's board can see, since no actions are published there.
        var cannotAttackRestriction = BattleActionRules.HasCannotAttackEffect(state, card)
            ? BattleActionRestriction.CannotAttackEffect
            : liveRestriction;

        if (cannotAttackRestriction != BattleActionRestriction.None)
        {
            // The reason travels *with the card*, so the opponent's board can explain the badge too - their
            // client receives no card actions, so it could never read the disabled Battle option's reason.
            statuses.Add(new CardStatusEffectResponse(
                Kind: CardStatusEffectCodes.CannotAttack,
                ReasonCode: BattleActionRules.ResolveRestrictionCode(cannotAttackRestriction),
                Reason: BattleActionRules.DescribeRestriction(cannotAttackRestriction)));
        }

        if (BattleActionRules.HasKeyword(
                state,
                card,
                EffectConditionKeywords.NotAffectedByOpponentSupportEffects))
        {
            statuses.Add(new CardStatusEffectResponse(CardStatusEffectCodes.ImmuneToOpponentSupportEffects));
        }

        // Suppression is a battlefield concept (a summon may negate the summoned card's own effects while it
        // stays in play), so leaders never report it.
        if (!isLeader && SourceCardEffectSuppression.IsSuppressedWhileOnField(state, card))
        {
            statuses.Add(new CardStatusEffectResponse(CardStatusEffectCodes.EffectsSuppressed));
        }

        return statuses;
    }
}
