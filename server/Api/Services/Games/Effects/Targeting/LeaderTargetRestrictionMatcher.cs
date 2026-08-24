namespace ProjectHiddenVillage.Server.Api.Services.Games;

internal static class LeaderTargetRestrictionMatcher
{
    public static bool Matches(LeaderCardInstanceState leader, ZoneCardRestriction restriction)
    {
        var hasPredicateSelector = restriction.Predicates?.Any() is true;
        if (!hasPredicateSelector)
        {
            return true;
        }

        var predicateMatches = restriction.Predicates!.All(predicate => PredicateMatches(leader, predicate));
        if (restriction.MatchMode == ZoneRestrictionMatchMode.All)
        {
            return predicateMatches;
        }

        return predicateMatches;
    }

    private static bool PredicateMatches(LeaderCardInstanceState leader, ZoneCardPropertyPredicate predicate)
    {
        var propertyValues = ResolvePropertyValues(leader, predicate.Property);
        if (propertyValues.Count == 0)
        {
            return false;
        }

        var directValue = predicate.Value;
        if (predicate.Property == ZoneCardProperty.Self && string.IsNullOrWhiteSpace(directValue))
        {
            directValue = bool.TrueString;
        }

        var listValues = predicate.Values ?? [];

        return predicate.Operator switch
        {
            ZoneCardPredicateOperator.Equals => !string.IsNullOrEmpty(directValue)
                && propertyValues.Any(value => StringEquals(value, directValue, predicate.IgnoreCase)),
            ZoneCardPredicateOperator.NotEquals => !string.IsNullOrEmpty(directValue)
                && propertyValues.All(value => !StringEquals(value, directValue, predicate.IgnoreCase)),
            ZoneCardPredicateOperator.In => (predicate.Property == ZoneCardProperty.Type && listValues.Count == 0)
                || (listValues.Count > 0
                    && propertyValues.Any(propertyValue => listValues.Any(expected => StringEquals(propertyValue, expected, predicate.IgnoreCase)))),
            ZoneCardPredicateOperator.Contains => !string.IsNullOrEmpty(directValue)
                && propertyValues.Any(value => value.Contains(directValue, predicate.IgnoreCase ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal)),
            ZoneCardPredicateOperator.GreaterThan => CompareNumeric(propertyValues, directValue, (left, right) => left > right),
            ZoneCardPredicateOperator.GreaterThanOrEqual => CompareNumeric(propertyValues, directValue, (left, right) => left >= right),
            ZoneCardPredicateOperator.LessThan => CompareNumeric(propertyValues, directValue, (left, right) => left < right),
            ZoneCardPredicateOperator.LessThanOrEqual => CompareNumeric(propertyValues, directValue, (left, right) => left <= right),
            _ => false,
        };
    }

    private static IReadOnlyList<string> ResolvePropertyValues(LeaderCardInstanceState leader, ZoneCardProperty property)
    {
        return property switch
        {
            ZoneCardProperty.Self => [bool.TrueString],
            ZoneCardProperty.Id => [leader.CardDefinitionId],
            ZoneCardProperty.OriginalId => [leader.CardDefinitionId],
            ZoneCardProperty.DisplayName => [leader.Name],
            ZoneCardProperty.Name => [leader.Name],
            ZoneCardProperty.Trait => leader.Traits,
            ZoneCardProperty.Type => [CardType.Leader.ToString()],
            ZoneCardProperty.Color => [leader.Color.ToString()],
            ZoneCardProperty.Power => [leader.Power.ToString()],
            ZoneCardProperty.Damage => [leader.Damage.ToString()],
            ZoneCardProperty.Health => [leader.TotalLife.ToString()],
            ZoneCardProperty.CurrentHealth => [leader.CurrentLife.ToString()],
            ZoneCardProperty.OwnerPlayerId => [leader.OwnerPlayerId],
            ZoneCardProperty.ControllerPlayerId => [leader.ControllerPlayerId],
            ZoneCardProperty.IsExhausted => [bool.FalseString],
            ZoneCardProperty.CannotBeNormalSummoned => [bool.FalseString],
            _ => [],
        };
    }

    private static bool CompareNumeric(
        IReadOnlyList<string> propertyValues,
        string? comparisonValue,
        Func<decimal, decimal, bool> predicate)
    {
        if (string.IsNullOrWhiteSpace(comparisonValue) || !decimal.TryParse(comparisonValue, out var rightValue))
        {
            return false;
        }

        foreach (var propertyValue in propertyValues)
        {
            if (!decimal.TryParse(propertyValue, out var leftValue))
            {
                continue;
            }

            if (predicate(leftValue, rightValue))
            {
                return true;
            }
        }

        return false;
    }

    private static bool StringEquals(string left, string right, bool ignoreCase)
    {
        return string.Equals(
            left,
            right,
            ignoreCase ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal);
    }
}