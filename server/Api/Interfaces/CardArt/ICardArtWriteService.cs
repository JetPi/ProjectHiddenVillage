using ErrorOr;
using ProjectHiddenVillage.Server.Api.Services.CardArt;

namespace ProjectHiddenVillage.Server.Api.Interfaces.CardArt;

/// <summary>
/// The write half of card art: uploading a master, and removing one again. Reads stay on
/// <see cref="ICardArtService"/>, which is anonymous, while everything here is admin-only.
/// </summary>
public interface ICardArtWriteService
{
    /// <summary>
    /// Validates an uploaded image, re-encodes it into a server-owned WebP master and returns the local
    /// reference the card entry should store.
    /// </summary>
    Task<ErrorOr<CardArtUploadResult>> StoreUploadAsync(
        string cardId,
        Stream content,
        string? contentType,
        CancellationToken cancellationToken);

    /// <summary>Removes a stored master plus its cached variants. Idempotent.</summary>
    Task<ErrorOr<Deleted>> DeleteUploadAsync(string cardId, CancellationToken cancellationToken);
}

/// <summary>What the admin screen needs to pass on when it creates the card.</summary>
public sealed record CardArtUploadResult(string CardId, string Reference, long Version);
