using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class GameEffectConditionDiagnostics : IGameEffectConditionDiagnostics
{
    public string BuildFailureMessage(EffectContextCondition condition)
    {
        var zoneName = condition.InZone?.ToString() ?? "AnyZone";

        if (condition.InZoneRequirements is null || condition.InZoneRequirements.Requirements.Count == 0)
        {
            return $"Condition for zone {zoneName} is not satisfied.";
        }

        var requirementDetails = string.Join(
            ", ",
            condition.InZoneRequirements.Requirements.Select((requirement, idx) =>
                $"#{idx}: {FormatRequirement(requirement)}"));

        return $"Zone {zoneName} requirement set is not satisfied (Operator={condition.InZoneRequirements.Operator}, Distinct={condition.InZoneRequirements.DistinctCardsAcrossRequirements}, Requirements=[{requirementDetails}]).";
    }

    private static string FormatRequirement(ZoneAmountRequirement requirement)
    {
        var restrictionDescription = FormatRestriction(requirement.Restriction);
        return $"{requirement.Comparison} {requirement.Amount} cards where {restrictionDescription}";
    }

    private static string FormatRestriction(ZoneCardRestriction restriction)
    {
        var details = (restriction.Predicates ?? [])
            .Select(FormatPredicate)
            .Where(detail => !string.IsNullOrWhiteSpace(detail))
            .ToList();

        if (details.Count == 0)
        {
            return "any card";
        }

        var joinKeyword = restriction.MatchMode == ZoneRestrictionMatchMode.All ? " and " : " or ";
        return string.Join(joinKeyword, details);
    }

    private static string FormatPredicate(ZoneCardPropertyPredicate predicate)
    {
        var property = predicate.Property.ToString();

        return predicate.Operator switch
        {
            ZoneCardPredicateOperator.In => $"{property} in [{string.Join("|", predicate.Values ?? [])}]",
            ZoneCardPredicateOperator.Contains => $"{property} contains '{predicate.Value}'",
            _ => $"{property} {predicate.Operator} '{predicate.Value}'",
        };
    }
}
