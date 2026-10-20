using ErrorOr;
using ProjectHiddenVillage.Server.Data.DTOs;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Api.Interfaces.Deck;

public interface IDeckService
{
    Task<ErrorOr<string>> CreateDeck(CreateDeckRequest request);

    /// <summary>Creates an admin-authored public deck from structured card lines.</summary>
    Task<ErrorOr<DeckResponse>> CreatePublicDeckAsync(CreatePublicDeckRequest request);

    /// <summary>Replaces an existing deck's name and card lines; its type and owner are untouched.</summary>
    Task<ErrorOr<DeckResponse>> UpdateDeckAsync(string deckId, UpdateDeckRequest request);

    Task<ErrorOr<bool>> DeleteDeck(string deckId);

    Task<ErrorOr<DeckResponse>> GetDeck(string deckId, bool populate = false);

    Task<ErrorOr<List<DeckResponse>>> GetDecks(
        Guid? userId = null,
        bool populate = false,
        DeckType? type = null);
}
