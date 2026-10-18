using ErrorOr;

namespace ProjectHiddenVillage.Server.Api.Interfaces.Card;

/// <summary>
/// Removing a card from the catalogue, together with everything that points at it.
/// </summary>
public interface ICardDeletionService
{
    /// <summary>
    /// Deletes the card, its stored art, and the deck and saved-deck rows that reference it.
    /// </summary>
    /// <param name="force">
    /// False reports back with a conflict when anything still references the card, so a caller can confirm before
    /// decks are edited. True performs the removal.
    /// </param>
    Task<ErrorOr<CardDeletionImpactResponse>> DeleteCardAsync(string cardId, bool force);
}
