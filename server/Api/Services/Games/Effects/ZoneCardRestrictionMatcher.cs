namespace ProjectHiddenVillage.Server.Api.Services.Games;

internal static class ZoneCardRestrictionMatcher
{
    public static bool Matches(Card cardDefinition, ZoneCardRestriction restriction)
    {
        var hasNameSelector = restriction.HasName?.Any() is true;
        var hasTraitSelector = restriction.HasTrait?.Any() is true;
        var hasTypeSelector = restriction.HasType?.Any() is true;
        var hasColorSelector = restriction.HasColor?.Any() is true;

        var noSelectorsProvided = !hasNameSelector && !hasTraitSelector && !hasTypeSelector && !hasColorSelector;
        if (noSelectorsProvided)
        {
            return true;
        }

        var nameMatches = !hasNameSelector || restriction.HasName!.Any(requiredName =>
            string.Equals(cardDefinition.DisplayName, requiredName, StringComparison.OrdinalIgnoreCase)
            || cardDefinition.Name.Any(name => string.Equals(name, requiredName, StringComparison.OrdinalIgnoreCase)));

        var traitMatches = !hasTraitSelector || restriction.HasTrait!.Any(requiredTrait =>
            cardDefinition.Traits.Any(cardTrait => string.Equals(cardTrait, requiredTrait, StringComparison.OrdinalIgnoreCase)));

        var typeMatches = !hasTypeSelector || restriction.HasType!.Contains(cardDefinition.Type);
        var colorMatches = !hasColorSelector || restriction.HasColor!.Contains(cardDefinition.Color);

        if (restriction.MatchMode == ZoneRestrictionMatchMode.All)
        {
            return nameMatches && traitMatches && typeMatches && colorMatches;
        }

        var positiveChecks = new List<bool>(4);
        if (hasNameSelector)
        {
            positiveChecks.Add(nameMatches);
        }
        if (hasTraitSelector)
        {
            positiveChecks.Add(traitMatches);
        }
        if (hasTypeSelector)
        {
            positiveChecks.Add(typeMatches);
        }
        if (hasColorSelector)
        {
            positiveChecks.Add(colorMatches);
        }

        return positiveChecks.Any(check => check);
    }
}
