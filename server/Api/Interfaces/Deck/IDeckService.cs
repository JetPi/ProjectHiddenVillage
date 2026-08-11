using ErrorOr;
using ProjectHiddenVillage.Server.Data.DTOs;

namespace ProjectHiddenVillage.Server.Api.Interfaces.Deck;

public interface IDeckService
{
    Task<ErrorOr<string>> CreateDeck(CreateDeckRequest request);

    Task<ErrorOr<DeckResponse>> GetDeck(string deckId, bool populate = false);

    Task<ErrorOr<List<DeckResponse>>> GetDecks(Guid? userId = null, bool populate = false);
}
