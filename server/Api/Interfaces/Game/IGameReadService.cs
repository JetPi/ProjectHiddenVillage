using ErrorOr;

namespace ProjectHiddenVillage.Server.Api.Interfaces.Game;

public interface IGameReadService
{
    Task<ErrorOr<List<CardCatalogItemResponse>>> GetCardDataForGame(string gameCode);

    Task<ErrorOr<ResolvedPlayerDeck>> ResolvePlayerDeckData(Guid userId, Guid deckId, string operationName);

    ErrorOr<GameInstance> GetById(string gameCode);
}
