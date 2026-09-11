namespace ProjectHiddenVillage.Server.Api.Services.Games;

/// <summary>
/// Builds short, human-readable labels describing the tribute material requirement an
/// <see cref="EffectTargetRule"/> imposes on a candidate (e.g. "Toad" or "Power ≥ 5").
/// A rule whose restriction does not filter the candidate pool describes a generic "any" tribute and
/// produces <c>null</c>.
/// </summary>
public static class TributeRequirementDescription
{
    public static string? BuildShortLabel(EffectTargetRule rule)
    {
        var restriction = rule.Restriction;
        var predicates = (restriction.Predicates ?? [])
            .Where(predicate => predicate.Property != ZoneCardProperty.Self)
            .ToList();

        if (predicates.Count == 0)
        {
            return null;
        }

        var details = new List<string>(predicates.Count);
        foreach (var predicate in predicates)
        {
            var detail = FormatPredicate(predicate);
            if (string.IsNullOrWhiteSpace(detail))
            {
                // A predicate that matches everything (e.g. Type In []) does not constrain the pool.
                return null;
            }

            details.Add(detail);
        }

        return string.Join(" & ", details);
    }

    private static string? FormatPredicate(ZoneCardPropertyPredicate predicate)
    {
        return predicate.Property switch
        {
            ZoneCardProperty.Trait
                or ZoneCardProperty.Type
                or ZoneCardProperty.Color
                or ZoneCardProperty.Name
                or ZoneCardProperty.DisplayName => FormatCategorical(predicate),
            ZoneCardProperty.Power
                or ZoneCardProperty.Damage
                or ZoneCardProperty.Health
                or ZoneCardProperty.CurrentHealth => FormatNumeric(predicate),
            _ => FormatGeneric(predicate),
        };
    }

    private static string? FormatCategorical(ZoneCardPropertyPredicate predicate)
    {
        switch (predicate.Operator)
        {
            case ZoneCardPredicateOperator.In when (predicate.Values ?? []).Count == 0:
                return null;
            case ZoneCardPredicateOperator.In:
                return string.Join(" or ", predicate.Values!);
            case ZoneCardPredicateOperator.Contains:
                return predicate.Value;
            case ZoneCardPredicateOperator.Equals:
                return predicate.Value;
            case ZoneCardPredicateOperator.NotEquals:
                return string.IsNullOrWhiteSpace(predicate.Value) ? null : $"not {predicate.Value}";
            default:
                return FormatGeneric(predicate);
        }
    }

    private static string FormatNumeric(ZoneCardPropertyPredicate predicate)
    {
        var symbol = predicate.Operator switch
        {
            ZoneCardPredicateOperator.GreaterThan => ">",
            ZoneCardPredicateOperator.GreaterThanOrEqual => "≥",
            ZoneCardPredicateOperator.LessThan => "<",
            ZoneCardPredicateOperator.LessThanOrEqual => "≤",
            ZoneCardPredicateOperator.NotEquals => "≠",
            _ => "=",
        };

        return $"{predicate.Property} {symbol} {predicate.Value}";
    }

    private static string FormatGeneric(ZoneCardPropertyPredicate predicate)
    {
        var value = predicate.Values is { Count: > 0 }
            ? string.Join(" or ", predicate.Values)
            : predicate.Value ?? string.Empty;

        return $"{predicate.Property} {predicate.Operator} {value}".Trim();
    }
}