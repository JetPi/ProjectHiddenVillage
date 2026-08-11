using ErrorOr;

namespace ProjectHiddenVillage.Server;

public interface IGameReadService
{
    Task<ErrorOr<List<CardCatalogItemResponse>>> GetCardDataForGame(string gameCode);

    ErrorOr<GameInstance> GetById(string gameCode);
}
