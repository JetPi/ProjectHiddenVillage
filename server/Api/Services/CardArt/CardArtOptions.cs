namespace ProjectHiddenVillage.Server.Api.Services.CardArt;

public sealed class CardArtOptions
{
    public const string SectionName = "CardArt";

    public string CacheDirectory { get; set; } = "card-art-cache";

    public List<int> AllowedWidths { get; set; } = [80, 120, 240, 600];

    public long MaxSourceBytes { get; set; } = 20 * 1024 * 1024;

    public List<string> SourceHostAllowlist { get; set; } = [];

    public double SourceTimeoutSeconds { get; set; } = 15;
}
