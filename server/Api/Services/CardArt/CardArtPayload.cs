namespace ProjectHiddenVillage.Server.Api.Services.CardArt;

public sealed class CardArtPayload
{
    public required Stream Stream { get; init; }

    public string ContentType { get; init; } = "image/webp";

    public required string ETag { get; init; }

    public bool IsImmutable { get; init; }
}
