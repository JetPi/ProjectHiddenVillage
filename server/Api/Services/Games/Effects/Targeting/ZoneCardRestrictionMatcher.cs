namespace ProjectHiddenVillage.Server.Api.Services.Games;

internal static class ZoneCardRestrictionMatcher
{
    public static bool Matches(Card cardDefinition, ZoneCardRestriction restriction, CardInstance? cardInstance = null)
    {
        var hasPredicateSelector = restriction.Predicates?.Any() is true;

        if (!hasPredicateSelector)
        {
            return true;
        }

        var predicateMatches = restriction.Predicates!.All(predicate => PredicateMatches(cardDefinition, cardInstance, predicate));

        if (restriction.MatchMode == ZoneRestrictionMatchMode.All)
        {
            return predicateMatches;
        }

        return predicateMatches;
    }

    private static bool PredicateMatches(Card cardDefinition, CardInstance? cardInstance, ZoneCardPropertyPredicate predicate)
    {
        if (string.IsNullOrWhiteSpace(predicate.Property))
        {
            return false;
        }

        var propertyValues = ResolvePropertyValues(cardDefinition, cardInstance, predicate.Property);
        if (propertyValues.Count == 0)
        {
            return false;
        }

        var directValue = predicate.Value;
        var listValues = predicate.Values ?? [];
        var normalizedProperty = NormalizePropertyName(predicate.Property);

        return predicate.Operator switch
        {
            ZoneCardPredicateOperator.Equals => !string.IsNullOrEmpty(directValue)
                && propertyValues.Any(value => StringEquals(value, directValue, predicate.IgnoreCase)),
            ZoneCardPredicateOperator.NotEquals => !string.IsNullOrEmpty(directValue)
                && propertyValues.All(value => !StringEquals(value, directValue, predicate.IgnoreCase)),
            ZoneCardPredicateOperator.In => (normalizedProperty == "type" && listValues.Count == 0)
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

    private static IReadOnlyList<string> ResolvePropertyValues(Card cardDefinition, CardInstance? cardInstance, string propertyName)
    {
        var normalizedProperty = NormalizePropertyName(propertyName);
        var effectiveBaseHealth = cardDefinition is CharacterCard characterCard ? characterCard.Health : 0;
        var effectiveHealth = cardInstance?.HealthOverride ?? effectiveBaseHealth;

        return normalizedProperty switch
        {
            "id" => [cardDefinition.Id],
            "originalid" => [cardDefinition.OriginalId],
            "displayname" => [cardDefinition.DisplayName],
            "name" or "names" => [cardDefinition.DisplayName, ..cardDefinition.Name],
            "trait" or "traits" => cardDefinition.Traits,
            "type" => [cardDefinition.Type.ToString()],
            "color" => [cardDefinition.Color.ToString()],
            "power" => [(cardInstance?.PowerOverride ?? cardDefinition.Power).ToString()],
            "damage" => [(cardInstance?.DamageOverride ?? cardDefinition.Damage).ToString()],
            "health" => [effectiveHealth.ToString()],
            "currenthealth" => [(cardInstance?.CurrentHealth ?? effectiveHealth).ToString()],
            "ownerplayerid" => cardInstance is null ? [] : [cardInstance.OwnerPlayerId],
            "controllerplayerid" => cardInstance is null ? [] : [cardInstance.ControllerPlayerId],
            "isexhausted" => [cardInstance is not null && cardInstance.IsExhausted ? bool.TrueString : bool.FalseString],
            "cannotbenormalsummoned" => [cardDefinition.CannotBeNormalSummoned ? bool.TrueString : bool.FalseString],
            _ => [],
        };
    }

    private static string NormalizePropertyName(string propertyName)
    {
        return new string(propertyName
            .Where(character => char.IsLetterOrDigit(character))
            .ToArray())
            .ToLowerInvariant();
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
