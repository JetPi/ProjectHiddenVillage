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
        var details = new List<string>();

        if (restriction.HasName is { Count: > 0 })
        {
            details.Add($"name in [{string.Join("|", restriction.HasName)}]");
        }

        if (restriction.HasTrait is { Count: > 0 })
        {
            details.Add($"trait in [{string.Join("|", restriction.HasTrait)}]");
        }

        if (restriction.HasType is { Count: > 0 })
        {
            details.Add($"type in [{string.Join("|", restriction.HasType)}]");
        }

        if (restriction.HasColor is { Count: > 0 })
        {
            details.Add($"color in [{string.Join("|", restriction.HasColor)}]");
        }

        if (details.Count == 0)
        {
            return "any card";
        }

        var joinKeyword = restriction.MatchMode == ZoneRestrictionMatchMode.All ? " and " : " or ";
        return string.Join(joinKeyword, details);
    }
}
