namespace ProjectHiddenVillage.Server.Api.Services.Games;

/// <summary>
/// Builds the authoritative tribute material requirements - each material label together with how many
/// DISTINCT cards of that material the summon consumes - straight from an effect's tribute material
/// rules. Sending the resolved groups stops the client from inferring requirement sizes from the
/// per-candidate labels, which cannot tell "Toad x2" (two rules sharing a label) apart from
/// "Toad x1 + any x1".
/// </summary>
public static class TributeMaterialRequirementBuilder
{
    /// <summary>
    /// Resolves the material requirement groups for a tribute effect, or <c>null</c> when the effect is
    /// not a tribute composition (or declares no material rules).
    /// </summary>
    public static IReadOnlyList<GameCardActionMaterialRequirementResponse>? BuildGroups(EffectTargetRuleSet targetRules)
    {
        if (targetRules.TributeComposition is null)
        {
            return null;
        }

        var materialRules = targetRules.Rules
            .Where(rule => rule.TributeRole != TributeTargetRole.SummonCandidate)
            .ToList();

        if (materialRules.Count == 0)
        {
            return null;
        }

        var requiredTotal = ResolveExactTargetCount(targetRules)
            ?? ResolveMinimumTargetCount(targetRules)
            ?? 1;

        var countsByLabel = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var orderedLabels = new List<string>();
        var slackLabels = new List<string>();

        foreach (var rule in materialRules)
        {
            var label = TributeRequirementDescription.BuildShortLabel(rule)
                ?? TributeRequirementDescription.GenericMaterialLabel;
            var requiredCount = rule.ExactSelectedTargetCount ?? rule.MinimumSelectedTargetCount ?? 0;

            if (requiredCount > 0)
            {
                AddCount(countsByLabel, orderedLabels, label, requiredCount);
            }

            // A rule can absorb cards beyond its own minimum when it declares no exact count and has
            // headroom, so slots left over from the total requirement may be paid with its material.
            var maximumCount = rule.ExactSelectedTargetCount ?? rule.MaximumSelectedTargetCount;
            if ((maximumCount is null || maximumCount > requiredCount)
                && !slackLabels.Contains(label, StringComparer.OrdinalIgnoreCase))
            {
                slackLabels.Add(label);
            }
        }

        var namedTotal = orderedLabels.Sum(label => countsByLabel[label]);
        var leftoverCount = requiredTotal - namedTotal;

        if (leftoverCount > 0 && slackLabels.Count == 1)
        {
            // Only one material can take the extra cards, so the leftover is that material.
            AddCount(countsByLabel, orderedLabels, slackLabels[0], leftoverCount);
        }
        else if (leftoverCount > 0 && slackLabels.Count > 1)
        {
            // Several materials can take the extra cards, so only the total is knowable.
            AddCount(countsByLabel, orderedLabels, TributeRequirementDescription.GenericMaterialLabel, leftoverCount);
        }

        if (orderedLabels.Count == 0)
        {
            AddCount(
                countsByLabel,
                orderedLabels,
                TributeRequirementDescription.GenericMaterialLabel,
                Math.Max(1, requiredTotal));
        }

        return orderedLabels
            .Select(label => new GameCardActionMaterialRequirementResponse(
                Label: label,
                RequiredCount: countsByLabel[label],
                IsGeneric: string.Equals(
                    label,
                    TributeRequirementDescription.GenericMaterialLabel,
                    StringComparison.OrdinalIgnoreCase)))
            .ToList();
    }

    public static int? ResolveExactTargetCount(EffectTargetRuleSet targetRules)
    {
        return targetRules.TributeComposition?.ExactTributeCount
            ?? targetRules.Rules
                .Where(rule => rule.TributeRole == TributeTargetRole.TributeMaterial)
                .Select(rule => rule.ExactSelectedTargetCount)
                .FirstOrDefault(count => count.HasValue);
    }

    public static int? ResolveMinimumTargetCount(EffectTargetRuleSet targetRules)
    {
        if (targetRules.TributeComposition?.ExactTributeCount is int exact)
        {
            return exact;
        }

        return targetRules.TributeComposition?.MinimumTributeCount
            ?? targetRules.Rules
                .Where(rule => rule.TributeRole == TributeTargetRole.TributeMaterial)
                .Select(rule => rule.MinimumSelectedTargetCount)
                .FirstOrDefault(count => count.HasValue)
            ?? targetRules.MinimumTargetCount;
    }

    public static int? ResolveMaximumTargetCount(EffectTargetRuleSet targetRules)
    {
        if (targetRules.TributeComposition?.ExactTributeCount is int exact)
        {
            return exact;
        }

        return targetRules.TributeComposition?.MaximumTributeCount
            ?? targetRules.Rules
                .Where(rule => rule.TributeRole == TributeTargetRole.TributeMaterial)
                .Select(rule => rule.MaximumSelectedTargetCount)
                .FirstOrDefault(count => count.HasValue)
            ?? targetRules.MaximumTargetCount;
    }

    private static void AddCount(
        Dictionary<string, int> countsByLabel,
        List<string> orderedLabels,
        string label,
        int count)
    {
        if (countsByLabel.TryGetValue(label, out var existingCount))
        {
            countsByLabel[label] = existingCount + count;
            return;
        }

        countsByLabel[label] = count;
        orderedLabels.Add(label);
    }
}
