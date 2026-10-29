using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server;

public sealed record DeckCardResponse(
    string CardId,
    int Quantity,
    CardCatalogItemResponse? Card = null);

/// <summary>
/// The requesting player's record with one deck. It is returned only to that player: the deck itself may be public,
/// but "7 wins, 3 losses" belongs to the player who played it, not to the deck.
/// </summary>
public sealed record DeckRecordResponse(
    int Wins,
    int Losses,
    int Draws);

public sealed record DeckResponse(
    Guid Id,
    string Name,
    string Type,
    Guid? UserId,
    string? LeaderColor,
    IReadOnlyList<DeckCardResponse> Cards,
    DeckRecordResponse? Record = null,
    string? LeaderCardId = null);

public sealed record DeckCardRequest(string CardId, int Quantity);

public sealed record CreatePublicDeckRequest(string Name, IReadOnlyList<DeckCardRequest> Cards);

public sealed record UpdateDeckRequest(string Name, IReadOnlyList<DeckCardRequest> Cards);
