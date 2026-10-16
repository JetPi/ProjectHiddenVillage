using ErrorOr;

namespace ProjectHiddenVillage.Server.Api.Interfaces.Card;

public interface ICardMappingService
{
    Task<ErrorOr<List<global::ProjectHiddenVillage.Server.Card>>> MapCards(IReadOnlyList<CardDataSourceRecord> sourceCards);

    Task<ErrorOr<PagedResponse<CardCatalogItemResponse>>> GetCardCatalog(int page = 1, int pageSize = 100, string? sort = null);

    Task<ErrorOr<List<CardCatalogItemResponse>>> GetCardCatalogByIds(IReadOnlyList<string>? cardIds);

    Task<ErrorOr<List<string>>> GetEffectConditionKeywords();

    Task<ErrorOr<CardCatalogItemResponse>> UpdateCardEffectsByCardId(string cardId, UpdateCardEffectsRequest request);

    /// <summary>Replaces (or clears) a card's art after the fact.</summary>
    Task<ErrorOr<CardCatalogItemResponse>> UpdateCardImageByCardId(string cardId, UpdateCardImageRequest request);

    /// <summary>Authoring a brand new catalogue card, as opposed to the seeding path that maps source records.</summary>
    Task<ErrorOr<CardCatalogItemResponse>> CreateCardAsync(CreateCardRequest request);
}
