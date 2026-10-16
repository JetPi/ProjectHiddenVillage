namespace ProjectHiddenVillage.Server.Api.Services.CardArt;

public sealed class CardArtOptions
{
    public const string SectionName = "CardArt";

    public string CacheDirectory { get; set; } = "card-art-cache";

    /// <summary>
    /// Where the masters uploaded through the admin flow are stored. Local master references are relative to
    /// this directory, and the directory must stay server-owned: nothing here is served directly.
    /// </summary>
    public string UploadDirectory { get; set; } = "card-art-uploads";

    public List<int> AllowedWidths { get; set; } = [80, 120, 240, 600];

    public long MaxSourceBytes { get; set; } = 20 * 1024 * 1024;

    /// <summary>Byte cap for an uploaded master, enforced while streaming before anything is decoded.</summary>
    public long MaxUploadBytes { get; set; } = 10 * 1024 * 1024;

    /// <summary>
    /// Pixel cap for an uploaded master. Dimensions are read without decoding the pixels, so a decompression
    /// bomb is refused before it can allocate.
    /// </summary>
    public int MaxUploadPixels { get; set; } = 40_000_000;

    /// <summary>Accepted upload content types. Anything else is refused before the body is read.</summary>
    public List<string> AllowedUploadContentTypes { get; set; } = ["image/png", "image/jpeg", "image/webp"];

    /// <summary>
    /// Whether abandoned masters are collected. Sweeps run opportunistically on a write rather than from a
    /// background service, so this being on costs nothing on an idle server.
    /// </summary>
    public bool OrphanSweepEnabled { get; set; } = true;

    /// <summary>Minimum time between sweeps. A sweep is skipped if one ran more recently than this.</summary>
    public int OrphanSweepIntervalMinutes { get; set; } = 60;

    /// <summary>
    /// How long a file has to be untouched before it can be collected. This is what keeps a sweep from deleting
    /// the upload of a card whose create request has not landed yet.
    /// </summary>
    public int OrphanGraceMinutes { get; set; } = 60;

    public List<string> SourceHostAllowlist { get; set; } = [];

    public double SourceTimeoutSeconds { get; set; } = 15;
}
