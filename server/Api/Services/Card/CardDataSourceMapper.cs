using System.Text.RegularExpressions;

namespace ProjectHiddenVillage.Server;

public static partial class CardDataSourceMapper
{
    [GeneratedRegex(@"\[(.*?)\]", RegexOptions.Compiled)]
    private static partial Regex EffectKeywordRegex();

    [GeneratedRegex(@"<br\s*/?>", RegexOptions.IgnoreCase | RegexOptions.Compiled)]
    private static partial Regex BrTagRegex();

    public static Card ToCard(CardDataSourceRecord source)
    {
        ArgumentNullException.ThrowIfNull(source);

        var cardType = ParseCardType(source.CategoryData);
        var power = ParseNullableInt(source.Power) ?? 0;
        var description = NormalizeOptional(source.Effect) ?? string.Empty;

        Card mapped = cardType switch
        {
            CardType.Leader => new LeaderCard
            {
                Life = source.Health ?? 0,
                RecoveryEffect = ExtractRecoveryEffect(description)
            },
            _ => new CharacterCard
            {
                Health = source.Health ?? 0,
                SupportName = ExtractSupportName(description),
                SupportEffect = ExtractSupportEffect(description)
            }
        };

        mapped.Id = NormalizeRequired(source.CardNo);
        mapped.Image = NormalizeRequired(source.Image);
        mapped.OriginalId = NormalizeRequired(source.OriginalId);
        mapped.MainAlternate = source.MainAlternate ?? false;
        mapped.Attribute = NormalizeOptional(source.Attribute);
        mapped.DisplayName = NormalizeRequired(source.Name);
        mapped.Name = BuildNameEntries(source.Name);
        mapped.Type = cardType;
        mapped.Traits = ParseTraits(source.Trait);
        mapped.Color = ParseColor(source.Color);
        mapped.Description = description;
        mapped.MainEffect = ExtractMainEffect(description);
        mapped.Damage = source.Damage ?? 0;
        mapped.Power = power;
        mapped.Conditions = ExtractConditions(description);
        mapped.Effects = [];

        return mapped;
    }

    private static string NormalizeRequired(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? string.Empty : value.Trim();
    }

    private static string? NormalizeOptional(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static int? ParseNullableInt(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return int.TryParse(value.Trim(), out var parsed) ? parsed : null;
    }

    private static CardType ParseCardType(string? categoryData)
    {
        var normalized = NormalizeRequired(categoryData).ToUpperInvariant();
        if (normalized == "LEADER")
        {
            return CardType.Leader;
        }

        if (normalized.Contains("EX", StringComparison.Ordinal))
        {
            return CardType.ExCharacter;
        }

        return CardType.Character;
    }

    private static CardColor ParseColor(string? color)
    {
        var normalized = NormalizeRequired(color);
        return Enum.TryParse<CardColor>(normalized, ignoreCase: true, out var parsed)
            ? parsed
            : CardColor.Red;
    }

    private static List<string> ParseTraits(string? trait)
    {
        if (string.IsNullOrWhiteSpace(trait))
        {
            return [];
        }

        return trait
            .Split('/', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .ToList();
    }

    private static List<string> BuildNameEntries(string? name)
    {
        var normalized = NormalizeRequired(name);
        if (string.IsNullOrEmpty(normalized))
        {
            return [];
        }

        return [normalized];
    }

    private static string ExtractRecoveryEffect(string description)
    {
        const string marker = "[Recovery]";
        var index = description.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
        if (index < 0)
        {
            return string.Empty;
        }

        return description[(index + marker.Length)..].Trim();
    }

    private static string ExtractMainEffect(string description)
    {
        const string supportMarker = "[Support]";
        const string recoveryMarker = "[Recovery]";

        var supportIndex = description.IndexOf(supportMarker, StringComparison.OrdinalIgnoreCase);
        var recoveryIndex = description.IndexOf(recoveryMarker, StringComparison.OrdinalIgnoreCase);

        var endIndex = description.Length;
        if (supportIndex >= 0)
        {
            endIndex = supportIndex;
        }

        if (recoveryIndex >= 0)
        {
            endIndex = Math.Min(endIndex, recoveryIndex);
        }

        var mainEffectSegment = description[..endIndex];
        var withoutBrTags = BrTagRegex().Replace(mainEffectSegment, " ");
        return withoutBrTags.Trim();
    }

    private static List<string> ExtractConditions(string description)
    {
        if (string.IsNullOrWhiteSpace(description))
        {
            return [];
        }

        var allowedKeywords = new HashSet<string>(
            EffectConditionKeywords.All,
            StringComparer.OrdinalIgnoreCase);

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var conditions = new List<string>();

        foreach (Match match in EffectKeywordRegex().Matches(description))
        {
            var keyword = NormalizeRequired(match.Groups[1].Value);
            if (allowedKeywords.Contains(keyword))
            {
                if (!seen.Add(keyword))
                {
                    continue;
                }

                conditions.Add(keyword);
                continue;
            }
        }

        return conditions;
    }

    private static string ExtractSupportName(string description)
    {
        const string supportMarker = "[Support]";
        var supportIndex = description.IndexOf(supportMarker, StringComparison.OrdinalIgnoreCase);
        if (supportIndex < 0)
        {
            return string.Empty;
        }

        var afterSupport = description[(supportIndex + supportMarker.Length)..];
        var brMatch = BrTagRegex().Match(afterSupport);
        var supportHeader = brMatch.Success
            ? afterSupport[..brMatch.Index]
            : afterSupport;

        return supportHeader.Trim();
    }

    private static string ExtractSupportEffect(string description)
    {
        const string supportMarker = "[Support]";
        var supportIndex = description.IndexOf(supportMarker, StringComparison.OrdinalIgnoreCase);
        if (supportIndex < 0)
        {
            return string.Empty;
        }

        var afterSupport = description[(supportIndex + supportMarker.Length)..];
        var firstBrMatch = BrTagRegex().Match(afterSupport);
        if (!firstBrMatch.Success)
        {
            return string.Empty;
        }

        var afterFirstBr = afterSupport[(firstBrMatch.Index + firstBrMatch.Length)..];
        var secondBrMatch = BrTagRegex().Match(afterFirstBr);
        var supportEffect = secondBrMatch.Success
            ? afterFirstBr[..secondBrMatch.Index]
            : afterFirstBr;

        return supportEffect.Trim();
    }

}