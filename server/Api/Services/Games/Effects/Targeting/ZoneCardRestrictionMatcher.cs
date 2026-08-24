namespace ProjectHiddenVillage.Server.Api.Services.Games;

internal static class ZoneCardRestrictionMatcher
{
    public static bool Matches(
        Card cardDefinition,
        ZoneCardRestriction restriction,
        CardInstance? cardInstance = null,
        CardInstance? sourceCardInstance = null)
    {
        var hasPredicateSelector = restriction.Predicates?.Any() is true;

        if (!hasPredicateSelector)
        {
            return true;
        }

        var predicateMatches = restriction.Predicates!.All(predicate =>
            PredicateMatches(cardDefinition, cardInstance, sourceCardInstance, predicate));

        if (restriction.MatchMode == ZoneRestrictionMatchMode.All)
        {
            return predicateMatches;
        }

        return predicateMatches;
    }

    private static bool PredicateMatches(
        Card cardDefinition,
        CardInstance? cardInstance,
        CardInstance? sourceCardInstance,
        ZoneCardPropertyPredicate predicate)
    {
        var propertyValues = ResolvePropertyValues(cardDefinition, cardInstance, sourceCardInstance, predicate.Property);
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

    private static IReadOnlyList<string> ResolvePropertyValues(
        Card cardDefinition,
        CardInstance? cardInstance,
        CardInstance? sourceCardInstance,
        ZoneCardProperty property)
    {
        var effectiveBaseHealth = cardDefinition is CharacterCard characterCard ? characterCard.Health : 0;
        var effectiveHealth = cardInstance?.HealthOverride ?? effectiveBaseHealth;

        return property switch
        {
            ZoneCardProperty.Self => cardInstance is null || sourceCardInstance is null
                ? []
                : [string.Equals(cardInstance.InstanceId, sourceCardInstance.InstanceId, StringComparison.Ordinal)
                    ? bool.TrueString
                    : bool.FalseString],
            ZoneCardProperty.Id => [cardDefinition.Id],
            ZoneCardProperty.OriginalId => [cardDefinition.OriginalId],
            ZoneCardProperty.DisplayName => [cardDefinition.DisplayName],
            ZoneCardProperty.Name => [cardDefinition.DisplayName, ..cardDefinition.Name],
            ZoneCardProperty.Trait => cardDefinition.Traits,
            ZoneCardProperty.Type => [cardDefinition.Type.ToString()],
            ZoneCardProperty.Color => [cardDefinition.Color.ToString()],
            ZoneCardProperty.Power => [(cardInstance?.PowerOverride ?? cardDefinition.Power).ToString()],
            ZoneCardProperty.Damage => [(cardInstance?.DamageOverride ?? cardDefinition.Damage).ToString()],
            ZoneCardProperty.Health => [effectiveHealth.ToString()],
            ZoneCardProperty.CurrentHealth => [(cardInstance?.CurrentHealth ?? effectiveHealth).ToString()],
            ZoneCardProperty.OwnerPlayerId => cardInstance is null ? [] : [cardInstance.OwnerPlayerId],
            ZoneCardProperty.ControllerPlayerId => cardInstance is null ? [] : [cardInstance.ControllerPlayerId],
            ZoneCardProperty.IsExhausted => [cardInstance is not null && cardInstance.IsExhausted ? bool.TrueString : bool.FalseString],
            ZoneCardProperty.IsRested => [cardInstance is not null && cardInstance.IsRested ? bool.TrueString : bool.FalseString],
            ZoneCardProperty.CannotBeNormalSummoned => [cardDefinition.CannotBeNormalSummoned ? bool.TrueString : bool.FalseString],
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
