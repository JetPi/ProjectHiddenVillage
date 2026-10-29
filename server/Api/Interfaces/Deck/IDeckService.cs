using ErrorOr;
using ProjectHiddenVillage.Server.Data.DTOs;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Api.Interfaces.Deck;

public interface IDeckService
{
    Task<ErrorOr<string>> CreateDeck(CreateDeckRequest request);

    /// <summary>
    /// Creates a deck without evaluating the active rulesets. Reserved for the e2e engine fixtures, which are
    /// deliberately illegal in every format.
    /// </summary>
    Task<ErrorOr<string>> CreateFixtureDeckAsync(CreateDeckRequest request);

    Task<ErrorOr<DeckResponse>> CreatePublicDeckAsync(CreatePublicDeckRequest request);

    /// <summary>
    /// Overwrites a deck's name and card list. A player may only update their own deck; <paramref name="isAdmin"/> is
    /// the one override that can edit somebody else's.
    /// </summary>
    Task<ErrorOr<DeckResponse>> UpdateDeckAsync(
        string deckId,
        UpdateDeckRequest request,
        Guid? requestingUserId = null,
        bool isAdmin = false);

    /// <summary>
    /// Removes a deck and, by cascade, its records. A player may only delete their own deck: <paramref name="requestingUserId"/>
    /// is the authenticated caller and <paramref name="isAdmin"/> is the one override that can remove somebody else's.
    /// </summary>
    Task<ErrorOr<bool>> DeleteDeck(string deckId, Guid? requestingUserId = null, bool isAdmin = false);

    /// <summary>
    /// One deck. <paramref name="viewerUserId"/> is the requesting player, when there is one: the record in the
    /// response belongs to that player alone.
    /// </summary>
    Task<ErrorOr<DeckResponse>> GetDeck(string deckId, bool populate = false, Guid? viewerUserId = null);

    /// <summary>
    /// Lists decks. <paramref name="viewerUserId"/> is the requesting player, when there is one: the records in the
    /// response belong to that player alone, so a listing never exposes somebody else's wins and losses.
    /// </summary>
    Task<ErrorOr<List<DeckResponse>>> GetDecks(
        Guid? userId = null,
        bool populate = false,
        DeckType? type = null,
        Guid? viewerUserId = null);
}
