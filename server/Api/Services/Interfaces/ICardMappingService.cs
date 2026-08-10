using ErrorOr;

namespace ProjectHiddenVillage.Server;

public interface ICardMappingService
{
    Task<ErrorOr<List<Card>>> MapCards(IReadOnlyList<CardDataSourceRecord> sourceCards);

    Task<ErrorOr<PagedResponse<CardCatalogItemResponse>>> GetCardCatalog(int page = 1, int pageSize = 100, string? sort = null);

    Task<ErrorOr<List<CardCatalogItemResponse>>> GetCardCatalogByIds(IReadOnlyList<string>? cardIds);
}
