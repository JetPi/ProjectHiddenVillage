using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Data.Seeding;

/// <summary>
/// The one description of <c>test-data/seed-profiles.json</c>'s <c>catalogEntries</c> section, shared by the
/// development seeder and the deployment-facing reference seeder.
///
/// It lives outside both of them because a card row has to be written the same way whoever writes it: the
/// catalog entry shape (name/traits/conditions/effects serialised as JSON columns, the enum types, the
/// support fields) is a contract with the catalogue endpoints. Two copies of this mapping would drift, and the
/// first symptom would be a card that renders correctly in development and wrongly in production.
/// </summary>
public static class CatalogManifest
{
    /// <summary>
    /// The repository layout, relative to the content root: running from <c>server/</c> puts the manifest in the
    /// sibling <c>test-data/</c> directory.
    /// </summary>
    public const string RelativePath = "../test-data/seed-profiles.json";

    /// <summary>
    /// The published layout: <c>ProjectHiddenVillage.Server.csproj</c> links the file in as
    /// <c>test-data/seed-profiles.json</c>, so it sits *inside* the app directory of the container.
    /// </summary>
    public const string PublishedRelativePath = "test-data/seed-profiles.json";

    public static JsonSerializerOptions CreateSerializerOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        options.Converters.Add(new Api.Serialization.FlexibleEnumJsonConverterFactory());
        return options;
    }

    /// <summary>
    /// Reads the catalogue entries out of the manifest. Missing file or unparsable JSON throws: a deployment that
    /// asked for reference data and silently got none would look exactly like a seeding bug at runtime.
    /// </summary>
    public static IReadOnlyList<SeedCatalogEntryDefinition> LoadCatalogEntries(string contentRootPath)
    {
        var manifestPath = ResolveManifestPath(contentRootPath);
        var json = File.ReadAllText(manifestPath);
        var manifest = JsonSerializer.Deserialize<CatalogManifestDefinition>(json, CreateSerializerOptions());
        if (manifest is null)
        {
            throw new InvalidOperationException("Seed manifest could not be parsed.");
        }

        return manifest.CatalogEntries;
    }

    /// <summary>
    /// Both layouts are tried: the repository one first, so a developer's working copy wins, then the published one,
    /// which is the only one a container has. Resolving against the content root alone put a container's manifest at
    /// <c>/test-data/seed-profiles.json</c> while the publish step wrote it to <c>/app/test-data/seed-profiles.json</c>.
    /// </summary>
    public static string ResolveManifestPath(string contentRootPath)
    {
        var candidates = new[]
        {
            Path.GetFullPath(Path.Combine(contentRootPath, RelativePath)),
            Path.GetFullPath(Path.Combine(contentRootPath, PublishedRelativePath)),
        };

        foreach (var candidate in candidates)
        {
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        throw new InvalidOperationException(
            $"Seed manifest was not found. Looked for '{string.Join("' and '", candidates)}'.");
    }

    public static CardCatalogEntry ToCardCatalogEntry(SeedCatalogEntryDefinition definition)
    {
        var utcNow = DateTimeOffset.UtcNow;
        return new CardCatalogEntry
        {
            CardId = definition.CardId,
            DisplayName = definition.DisplayName,
            Image = definition.Image,
            Type = definition.Type,
            Color = definition.Color,
            Description = definition.Description,
            NameJson = JsonSerializer.Serialize(definition.Name),
            TraitsJson = JsonSerializer.Serialize(definition.Traits),
            ConditionsJson = JsonSerializer.Serialize(definition.Conditions),
            EffectsJson = JsonSerializer.Serialize(definition.Effects, CreateSerializerOptions()),
            Damage = definition.Damage,
            Power = definition.Power,
            Life = definition.Life,
            Health = definition.Health,
            SupportName = definition.SupportName,
            SupportEffect = definition.SupportEffect,
            CannotBeNormalSummoned = definition.CannotBeNormalSummoned,
            CreatedAtUtc = utcNow,
            UpdatedAtUtc = utcNow,
        };
    }

    private sealed record CatalogManifestDefinition(
        IReadOnlyList<SeedCatalogEntryDefinition> CatalogEntries);
}

/// <summary>
/// One card as the manifest authors it. Public because a deployment seeds the catalogue without the demo
/// profiles, and both paths have to deserialise the same shape.
/// </summary>
public sealed record SeedCatalogEntryDefinition(
    string CardId,
    string DisplayName,
    string Image,
    CardType Type,
    CardColor Color,
    string Description,
    IReadOnlyList<string> Name,
    IReadOnlyList<string> Traits,
    IReadOnlyList<string> Conditions,
    IReadOnlyList<EffectSpec> Effects,
    int Damage,
    int Power,
    int? Life,
    int? Health,
    string SupportName,
    string SupportEffect,
    bool CannotBeNormalSummoned);
