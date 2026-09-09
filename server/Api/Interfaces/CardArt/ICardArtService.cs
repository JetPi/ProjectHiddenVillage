using ProjectHiddenVillage.Server.Api.Services.CardArt;

namespace ProjectHiddenVillage.Server.Api.Interfaces.CardArt;

public interface ICardArtService
{
    /// <summary>
    /// Resolves a width-capped WebP variant of a card's raw art. Returns null when the
    /// card is unknown, its raw source cannot be fetched, or it cannot be decoded.
    /// </summary>
    Task<CardArtPayload?> ResolveAsync(
        string cardId,
        int width,
        string? version,
        CancellationToken cancellationToken);
}
