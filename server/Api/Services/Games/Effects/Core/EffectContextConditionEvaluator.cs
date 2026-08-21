using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class EffectContextConditionEvaluator : IGameEffectContextConditionEvaluator
{
    public bool IsConditionSatisfied(EffectContextCondition condition, PlayerState playerState, GameState gameState)
    {
        if (condition.InZone is null)
        {
            return true;
        }

        var zoneInstance = PlayerZoneCardAccessor.GetCards(condition.InZone.Value, playerState);

        if (condition.InZoneRequirements is null || !condition.InZoneRequirements.Requirements.Any())
        {
            return true;
        }

        var zoneCards = new List<(Card Definition, CardInstance Instance)>(zoneInstance.Count);
        foreach (var cardInstance in zoneInstance)
        {
            if (!gameState.CardDefinitions.TryGetValue(cardInstance.CardDefinitionId, out var cardDefinition))
            {
                return false;
            }

            zoneCards.Add((cardDefinition, cardInstance));
        }

        return EvaluateZoneRequirements(condition.InZoneRequirements, zoneCards);
    }

    private static bool EvaluateZoneRequirements(ZoneRequirementSet requirementSet, IReadOnlyList<(Card Definition, CardInstance Instance)> zoneCards)
    {
        var requirements = requirementSet.Requirements;
        if (requirements.Count == 0)
        {
            return true;
        }

        var matchCountByRestrictionKey = new Dictionary<string, int>(StringComparer.Ordinal);
        var candidateIndexesByRestrictionKey = new Dictionary<string, int[]>(StringComparer.Ordinal);

        if (requirementSet.Operator == RequirementGroupOperator.Any)
        {
            return requirements.Any(requirement => RequirementIsSatisfied(requirement, zoneCards, matchCountByRestrictionKey));
        }

        if (!requirementSet.DistinctCardsAcrossRequirements)
        {
            return requirements.All(requirement => RequirementIsSatisfied(requirement, zoneCards, matchCountByRestrictionKey));
        }

        return RequirementsSatisfiedWithDistinctCards(requirements, zoneCards, candidateIndexesByRestrictionKey);
    }

    private static bool RequirementIsSatisfied(
        ZoneAmountRequirement requirement,
        IReadOnlyList<(Card Definition, CardInstance Instance)> zoneCards,
        Dictionary<string, int> matchCountByRestrictionKey)
    {
        var restrictionKey = BuildRestrictionKey(requirement.Restriction);
        if (!matchCountByRestrictionKey.TryGetValue(restrictionKey, out var matchCount))
        {
            matchCount = zoneCards.Count(card => ZoneCardRestrictionMatcher.Matches(card.Definition, requirement.Restriction, card.Instance));
            matchCountByRestrictionKey[restrictionKey] = matchCount;
        }

        return ComparisonMatches(requirement.Comparison, requirement.Amount, matchCount);
    }

    private static bool ComparisonMatches(ZoneAmountComparison comparison, int targetAmount, int actualCount)
    {
        return comparison switch
        {
            ZoneAmountComparison.Exact => actualCount == targetAmount,
            ZoneAmountComparison.Minimum => actualCount >= targetAmount,
            ZoneAmountComparison.Maximum => actualCount <= targetAmount,
            _ => false,
        };
    }

    private static bool RequirementsSatisfiedWithDistinctCards(
        IReadOnlyList<ZoneAmountRequirement> requirements,
        IReadOnlyList<(Card Definition, CardInstance Instance)> zoneCards,
        Dictionary<string, int[]> candidateIndexesByRestrictionKey)
    {
        var candidateIndexesPerRequirement = requirements
            .Select(requirement => GetCandidateIndexes(requirement.Restriction, zoneCards, candidateIndexesByRestrictionKey))
            .ToArray();

        var orderedRequirementIndexes = Enumerable.Range(0, requirements.Count)
            .OrderBy(index => candidateIndexesPerRequirement[index].Length)
            .ToArray();

        var usedCardIndexes = new HashSet<int>();
        return TrySatisfyDistinctRequirements(requirements, candidateIndexesPerRequirement, orderedRequirementIndexes, usedCardIndexes, 0);
    }

    private static int[] GetCandidateIndexes(
        ZoneCardRestriction restriction,
        IReadOnlyList<(Card Definition, CardInstance Instance)> zoneCards,
        Dictionary<string, int[]> candidateIndexesByRestrictionKey)
    {
        var restrictionKey = BuildRestrictionKey(restriction);
        if (candidateIndexesByRestrictionKey.TryGetValue(restrictionKey, out var cachedIndexes))
        {
            return cachedIndexes;
        }

        var candidateIndexes = zoneCards
            .Select((card, index) => (card, index))
            .Where(tuple => ZoneCardRestrictionMatcher.Matches(tuple.card.Definition, restriction, tuple.card.Instance))
            .Select(tuple => tuple.index)
            .ToArray();

        candidateIndexesByRestrictionKey[restrictionKey] = candidateIndexes;
        return candidateIndexes;
    }

    private static string BuildRestrictionKey(ZoneCardRestriction restriction)
    {
        static string SerializePredicates(IReadOnlyList<ZoneCardPropertyPredicate>? predicates)
            => predicates is { Count: > 0 }
                ? string.Join(",", predicates.Select(predicate =>
                    $"{predicate.Property}:{predicate.Operator}:{predicate.Value}:{string.Join("/", predicate.Values ?? [])}:{predicate.IgnoreCase}"))
                : "-";

        return $"mode:{restriction.MatchMode}|pred:{SerializePredicates(restriction.Predicates)}";
    }

    private static bool TrySatisfyDistinctRequirements(
        IReadOnlyList<ZoneAmountRequirement> requirements,
        IReadOnlyList<int[]> candidateIndexesPerRequirement,
        IReadOnlyList<int> orderedRequirementIndexes,
        HashSet<int> usedCardIndexes,
        int orderedPosition)
    {
        if (orderedPosition >= orderedRequirementIndexes.Count)
        {
            return true;
        }

        var requirementIndex = orderedRequirementIndexes[orderedPosition];
        var requirement = requirements[requirementIndex];
        var availableCandidates = candidateIndexesPerRequirement[requirementIndex]
            .Where(index => !usedCardIndexes.Contains(index))
            .ToArray();

        var selectableCount = availableCandidates.Length;
        var allowedCounts = GetAllowedDistinctSelectionCounts(requirement.Comparison, requirement.Amount, selectableCount);

        foreach (var pickCount in allowedCounts)
        {
            if (pickCount == 0)
            {
                if (TrySatisfyDistinctRequirements(requirements, candidateIndexesPerRequirement, orderedRequirementIndexes, usedCardIndexes, orderedPosition + 1))
                {
                    return true;
                }

                continue;
            }

            foreach (var chosenIndexes in ChooseCombinations(availableCandidates, pickCount))
            {
                foreach (var chosenIndex in chosenIndexes)
                {
                    usedCardIndexes.Add(chosenIndex);
                }

                if (TrySatisfyDistinctRequirements(requirements, candidateIndexesPerRequirement, orderedRequirementIndexes, usedCardIndexes, orderedPosition + 1))
                {
                    return true;
                }

                foreach (var chosenIndex in chosenIndexes)
                {
                    usedCardIndexes.Remove(chosenIndex);
                }
            }
        }

        return false;
    }

    private static IReadOnlyList<int> GetAllowedDistinctSelectionCounts(ZoneAmountComparison comparison, int amount, int availableCount)
    {
        if (amount < 0)
        {
            return [];
        }

        return comparison switch
        {
            ZoneAmountComparison.Exact when amount <= availableCount => [amount],
            ZoneAmountComparison.Exact => [],
            ZoneAmountComparison.Minimum when amount <= availableCount => Enumerable.Range(amount, availableCount - amount + 1).ToArray(),
            ZoneAmountComparison.Minimum => [],
            ZoneAmountComparison.Maximum => Enumerable.Range(0, Math.Min(amount, availableCount) + 1).ToArray(),
            _ => [],
        };
    }

    private static IEnumerable<IReadOnlyList<int>> ChooseCombinations(IReadOnlyList<int> values, int choose)
    {
        if (choose == 0)
        {
            yield return [];
            yield break;
        }

        if (choose > values.Count)
        {
            yield break;
        }

        foreach (var combination in ChooseCombinations(values, choose, 0, []))
        {
            yield return combination;
        }
    }

    private static IEnumerable<IReadOnlyList<int>> ChooseCombinations(IReadOnlyList<int> values, int choose, int startIndex, IReadOnlyList<int> prefix)
    {
        if (choose == 0)
        {
            yield return prefix;
            yield break;
        }

        for (var index = startIndex; index <= values.Count - choose; index++)
        {
            var nextPrefix = prefix.Append(values[index]).ToArray();

            foreach (var combination in ChooseCombinations(values, choose - 1, index + 1, nextPrefix))
            {
                yield return combination;
            }
        }
    }
}
