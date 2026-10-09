namespace ProjectHiddenVillage.Server.Api.Services.Games;

/// <summary>
/// Single source of truth for placing a card onto a Character Field by summon.
///
/// "No Normal Summon" (<c>Card.CannotBeNormalSummoned</c>) gates the *normal* summon only - the summon performed
/// by resting the summon card. Every other route a card can reach the field through is a special summon, so the
/// flag must never refuse one:
/// <list type="bullet">
/// <item>the hand <c>summon-to-field</c> action of a card that prints a [Summon Requirements] node (the registry
/// pays its materials and places the card without resting the summon card) - N-003/N-005/N-014/N-022;</item>
/// <item>a <c>Summon Card</c> effect placing a card, such as N-003's "[On Summon] Summon up to 1 [Naruto Uzumaki]
/// from your deck or trash", which summons a copy of the very card the flag is printed on;</item>
/// <item>the <c>Tribute</c> runtime effect behind a summon requirement, when that node is walked as a chain.</item>
/// </list>
/// A candidate pool that must exclude special-summon-only cards is authored with a
/// <c>CannotBeNormalSummoned</c> target predicate on the effect, never with an implicit rule here.
/// </summary>
internal static class SummonPlacementRules
{
    /// <summary>
    /// Whether a card of this definition can be placed onto a Character Field at all. Chakra and Summon cards are
    /// the only card types that can never occupy a character zone.
    /// </summary>
    internal static bool IsPlaceableOnCharacterField(Card cardDefinition)
    {
        return cardDefinition.Type is not (CardType.Chakra or CardType.Summon);
    }
}
