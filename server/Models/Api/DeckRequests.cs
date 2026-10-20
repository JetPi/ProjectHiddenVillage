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
    IReadOnlyList<DeckCardResponse> Cards);

/// <summary>
/// One card line of a structured deck write. The admin builder sends these instead of the legacy
/// <c>"3x N-001"</c> text payload, so the server never has to re-parse a list it was handed as data.
/// </summary>
public sealed record DeckCardRequest(string CardId, int Quantity);

/// <summary>Creates an admin-authored deck. The type is always <c>Public</c>; the caller cannot choose it.</summary>
public sealed record CreatePublicDeckRequest(string Name, IReadOnlyList<DeckCardRequest> Cards);

/// <summary>
/// Replaces a deck's name and card lines. The deck's type and owner are not part of an update, so an edit can
/// never turn a public deck into a player deck or hand a deck to another account.
/// </summary>
public sealed record UpdateDeckRequest(string Name, IReadOnlyList<DeckCardRequest> Cards);
