using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server;

public sealed record DeckCardResponse(
    string CardId,
    int Quantity,
    CardCatalogItemResponse? Card = null);

public sealed record DeckResponse(
    Guid Id,
    string Name,
    string Type,
    Guid? UserId,
    string? LeaderColor,
    IReadOnlyList<DeckCardResponse> Cards);

public sealed record DeckCardRequest(string CardId, int Quantity);

public sealed record CreatePublicDeckRequest(string Name, IReadOnlyList<DeckCardRequest> Cards);

public sealed record UpdateDeckRequest(string Name, IReadOnlyList<DeckCardRequest> Cards);
