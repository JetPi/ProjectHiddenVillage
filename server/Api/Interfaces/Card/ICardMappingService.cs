using ErrorOr;

namespace ProjectHiddenVillage.Server.Api.Interfaces.Card;

public interface ICardMappingService
{
    Task<ErrorOr<List<global::ProjectHiddenVillage.Server.Card>>> MapCards(IReadOnlyList<CardDataSourceRecord> sourceCards);

    Task<ErrorOr<PagedResponse<CardCatalogItemResponse>>> GetCardCatalog(int page = 1, int pageSize = 100, string? sort = null);

    Task<ErrorOr<List<CardCatalogItemResponse>>> GetCardCatalogByIds(IReadOnlyList<string>? cardIds);
}
