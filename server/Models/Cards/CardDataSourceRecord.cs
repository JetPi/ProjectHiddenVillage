using System.Text.Json.Serialization;

namespace ProjectHiddenVillage.Server;

// Raw upstream card payload. This is intentionally separate from the internal Card model.
public sealed record CardDataSourceRecord
{
    [JsonPropertyName("cardno")]
    public string CardNo { get; init; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; init; } = string.Empty;

    [JsonPropertyName("image")]
    public string? Image { get; init; }

    [JsonPropertyName("color")]
    public string? Color { get; init; }

    [JsonPropertyName("categorydata")]
    public string? CategoryData { get; init; }

    [JsonPropertyName("rarity")]
    public string? Rarity { get; init; }

    [JsonPropertyName("cost")]
    public int? Cost { get; init; }

    [JsonPropertyName("power")]
    public string? Power { get; init; }

    [JsonPropertyName("attribute")]
    public string? Attribute { get; init; }

    [JsonPropertyName("effect")]
    public string? Effect { get; init; }

    [JsonPropertyName("originalid")]
    public string? OriginalId { get; init; }

    [JsonPropertyName("series")]
    public string? Series { get; init; }

    [JsonPropertyName("seriesname")]
    public string? SeriesName { get; init; }

    [JsonPropertyName("mainalternate")]
    public bool? MainAlternate { get; init; }

    [JsonPropertyName("abbreviation")]
    public string? Abbreviation { get; init; }

    [JsonPropertyName("created_at")]
    public DateTimeOffset? CreatedAt { get; init; }

    [JsonPropertyName("dmg")]
    public int? Damage { get; init; }

    [JsonPropertyName("hp")]
    public int? Health { get; init; }

    [JsonPropertyName("trait")]
    public string? Trait { get; init; }
}