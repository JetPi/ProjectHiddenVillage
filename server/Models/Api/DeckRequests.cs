using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server;

public sealed record DeckCardResponse(
    string CardId,
    int Quantity,
    CardCatalogItemResponse? Card = null);

public sealed record DeckResponse(
    Guid Id,
    string Type,
    Guid? UserId,
    IReadOnlyList<DeckCardResponse> Cards);
