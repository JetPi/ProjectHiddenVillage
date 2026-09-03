namespace ProjectHiddenVillage.Server.Api.Services.Games;

/// <summary>
/// Determines whether a pool of candidate targets can satisfy the tribute material rules declared on
/// an effect, while requiring each material rule to draw from DISTINCT cards.
///
/// A single field card must never satisfy two different material rules at the same time (e.g. a
/// "any" material rule and a trait-restricted material rule must each receive their own card).
/// This mirrors the distinct-card assignment approach used by
/// <see cref="EffectContextConditionEvaluator"/> for zone amount requirements.
/// </summary>
internal static class TributeMaterialAssignmentSolver
{
    public static bool TrySatisfy(
        GameState gameState,
        PlayerState actingPlayerState,
        CardInstance? summonCandidateInstance,
        IReadOnlyList<EffectTargetRule> materialRules,
        TributeTargetComposition composition,
        IReadOnlyList<GameEffectTargetReference> pool,
        bool requireUseEntirePool,
        out string failure)
    {
        failure = string.Empty;

        if (materialRules.Count == 0)
        {
            failure = "Effect does not declare any tribute material target rule.";
            return false;
        }

        if (pool.Count == 0)
        {
            failure = "No tribute material targets are available.";
            return false;
        }

        var requireDistinctFromSummonCandidate = composition?.RequireDistinctSummonAndTributes ?? true;
        var candidateIndexesByRule = materialRules
            .Select(rule => GetPoolIndexesMatchingRule(
                rule,
                gameState,
                actingPlayerState,
                summonCandidateInstance,
                requireDistinctFromSummonCandidate,
                pool))
            .ToArray();

        // Every candidate in the pool must be usable as at least one material when the whole pool
        // represents the player's actual selection.
        if (requireUseEntirePool)
        {
            for (var index = 0; index < pool.Count; index++)
            {
                var matchesSomeRule = candidateIndexesByRule.Any(ruleIndexes => ruleIndexes.Contains(index));
                if (matchesSomeRule)
                {
                    continue;
                }

                failure = $"Selected tribute material target does not satisfy any tribute material rule (card instance '{pool[index].CardInstanceId}').";
                return false;
            }
        }

        var ruleCount = materialRules.Count;
        var orderedRuleIndexes = Enumerable.Range(0, ruleCount).ToArray();
        Array.Sort(orderedRuleIndexes, (left, right) =>
            candidateIndexesByRule[left].Length.CompareTo(candidateIndexesByRule[right].Length));

        if (requireUseEntirePool)
        {
            var requiredTotal = pool.Count;

            if (composition is not null && !IsTributeCountValid(composition, requiredTotal, out failure))
            {
                return false;
            }

            if (TrySatisfyExactTotal(
                    materialRules,
                    candidateIndexesByRule,
                    orderedRuleIndexes,
                    requiredTotal,
                    out failure))
            {
                return true;
            }

            failure = "Selected tribute material targets cannot be assigned to the tribute material rules using distinct cards.";
            return false;
        }

        return TrySatisfyAnyTotalWithinComposition(
            composition,
            materialRules,
            candidateIndexesByRule,
            orderedRuleIndexes,
            pool.Count,
            out failure);
    }

    private static bool TrySatisfyAnyTotalWithinComposition(
        TributeTargetComposition? composition,
        IReadOnlyList<EffectTargetRule> materialRules,
        IReadOnlyList<int[]> candidateIndexesByRule,
        IReadOnlyList<int> orderedRuleIndexes,
        int poolCount,
        out string failure)
    {
        failure = string.Empty;

        var totalsToTry = new List<int>();

        if (composition?.ExactTributeCount is int exactTotal)
        {
            totalsToTry.Add(exactTotal);
        }
        else
        {
            var minimum = composition?.MinimumTributeCount
                ?? materialRules.Sum(rule => rule.MinimumSelectedTargetCount ?? 0);
            var maximum = composition?.MaximumTributeCount
                ?? materialRules.Sum(rule => rule.MaximumSelectedTargetCount ?? poolCount);

            minimum = Math.Clamp(minimum, 0, poolCount);
            maximum = Math.Min(Math.Max(minimum, maximum), poolCount);

            if (minimum == 0 && composition is null)
            {
                minimum = 1;
            }

            for (var total = minimum; total <= maximum; total++)
            {
                totalsToTry.Add(total);
            }
        }

        foreach (var totalToTry in totalsToTry)
        {
            if (TrySatisfyExactTotal(
                    materialRules,
                    candidateIndexesByRule,
                    orderedRuleIndexes,
                    totalToTry,
                    out _))
            {
                return true;
            }
        }

        failure = composition is not null
            ? "Available tribute material targets cannot satisfy the tribute composition with distinct cards."
            : "Available tribute material targets cannot be assigned to the tribute material rules using distinct cards.";
        return false;
    }

    private static bool TrySatisfyExactTotal(
        IReadOnlyList<EffectTargetRule> materialRules,
        IReadOnlyList<int[]> candidateIndexesByRule,
        IReadOnlyList<int> orderedRuleIndexes,
        int requiredTotal,
        out string failure)
    {
        failure = string.Empty;

        var usedCardIndexes = new HashSet<int>();
        return CanAssign(
            materialRules,
            candidateIndexesByRule,
            orderedRuleIndexes,
            usedCardIndexes,
            orderedPosition: 0,
            totalAssigned: 0,
            requiredTotal);
    }


    private static bool CanAssign(
        IReadOnlyList<EffectTargetRule> materialRules,
        IReadOnlyList<int[]> candidateIndexesByRule,
        IReadOnlyList<int> orderedRuleIndexes,
        HashSet<int> usedCardIndexes,
        int orderedPosition,
        int totalAssigned,
        int requiredTotal)
    {
        if (orderedPosition >= orderedRuleIndexes.Count)
        {
            return totalAssigned == requiredTotal;
        }

        if (totalAssigned > requiredTotal)
        {
            return false;
        }

        var ruleIndex = orderedRuleIndexes[orderedPosition];
        var rule = materialRules[ruleIndex];
        var ruleCandidateIndexes = candidateIndexesByRule[ruleIndex];

        var remainingRules = orderedRuleIndexes.Count - orderedPosition - 1;
        var futureMinimum = 0;
        var futureMaximum = 0;

        for (var offset = 1; offset <= remainingRules; offset++)
        {
            var upcomingIndex = orderedRuleIndexes[orderedPosition + offset];
            var (upcomingMinimum, upcomingMaximum) = GetRuleSelectionBounds(materialRules[upcomingIndex], candidateIndexesByRule[upcomingIndex].Length);
            futureMinimum += upcomingMinimum;
            futureMaximum += upcomingMaximum;
        }

        var availableCandidateIndexes = ruleCandidateIndexes
            .Where(index => !usedCardIndexes.Contains(index))
            .ToArray();

        var (ruleMinimum, ruleMaximum) = GetRuleSelectionBounds(rule, ruleCandidateIndexes.Length);
        var remainingNeed = requiredTotal - totalAssigned;

        var minimumCount = Math.Max(ruleMinimum, 0);
        var maximumCount = Math.Min(ruleMaximum, Math.Min(availableCandidateIndexes.Length, remainingNeed - futureMinimum));

        if (maximumCount < minimumCount)
        {
            return false;
        }

        for (var pickCount = minimumCount; pickCount <= maximumCount; pickCount++)
        {
            if (totalAssigned + pickCount + futureMinimum > requiredTotal
                || totalAssigned + pickCount + futureMaximum < requiredTotal)
            {
                continue;
            }

            foreach (var chosenIndexes in ChooseCombinations(availableCandidateIndexes, pickCount))
            {
                foreach (var chosenIndex in chosenIndexes)
                {
                    usedCardIndexes.Add(chosenIndex);
                }

                if (CanAssign(
                        materialRules,
                        candidateIndexesByRule,
                        orderedRuleIndexes,
                        usedCardIndexes,
                        orderedPosition + 1,
                        totalAssigned + pickCount,
                        requiredTotal))
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

    private static (int Minimum, int Maximum) GetRuleSelectionBounds(EffectTargetRule rule, int candidateCount)
    {
        if (rule.ExactSelectedTargetCount is int exact)
        {
            return (exact, exact);
        }

        var minimum = rule.MinimumSelectedTargetCount ?? 0;
        var maximum = rule.MaximumSelectedTargetCount ?? candidateCount;

        return (Math.Max(minimum, 0), Math.Min(maximum, candidateCount));
    }


    private static int[] GetPoolIndexesMatchingRule(
        EffectTargetRule rule,
        GameState gameState,
        PlayerState actingPlayerState,
        CardInstance? summonCandidateInstance,
        bool requireDistinctFromSummonCandidate,
        IReadOnlyList<GameEffectTargetReference> pool)
    {
        var matchingIndexes = new List<int>(pool.Count);

        for (var index = 0; index < pool.Count; index++)
        {
            if (TributeMaterialRuleMatcher.Matches(
                    pool[index],
                    rule,
                    actingPlayerState,
                    gameState,
                    summonCandidateInstance,
                    requireDistinctFromSummonCandidate))
            {
                matchingIndexes.Add(index);
            }
        }

        return matchingIndexes.ToArray();
    }

    private static bool IsTributeCountValid(TributeTargetComposition composition, int tributeCount, out string failure)
    {
        failure = string.Empty;

        if (composition.ExactTributeCount.HasValue)
        {
            if (tributeCount != composition.ExactTributeCount.Value)
            {
                failure = $"Selected targets must include exactly {composition.ExactTributeCount.Value} tribute material target(s).";
                return false;
            }

            return true;
        }

        if (composition.MinimumTributeCount.HasValue && tributeCount < composition.MinimumTributeCount.Value)
        {
            failure = $"Selected targets must include at least {composition.MinimumTributeCount.Value} tribute material target(s).";
            return false;
        }

        if (composition.MaximumTributeCount.HasValue && tributeCount > composition.MaximumTributeCount.Value)
        {
            failure = $"Selected targets must include no more than {composition.MaximumTributeCount.Value} tribute material target(s).";
            return false;
        }

        return true;
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

    private static IEnumerable<IReadOnlyList<int>> ChooseCombinations(
        IReadOnlyList<int> values,
        int choose,
        int startIndex,
        IReadOnlyList<int> prefix)
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

