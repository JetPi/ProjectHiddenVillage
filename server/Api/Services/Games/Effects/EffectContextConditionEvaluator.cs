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

        var zoneInstance = GetZoneByEnum(condition.InZone.Value, playerState);

        if (condition.InZoneRequirements is null || !condition.InZoneRequirements.Requirements.Any())
        {
            return true;
        }

        var zoneCards = new List<Card>(zoneInstance.Count);
        foreach (var cardInstance in zoneInstance)
        {
            if (!gameState.CardDefinitions.TryGetValue(cardInstance.CardDefinitionId, out var cardDefinition))
            {
                return false;
            }

            zoneCards.Add(cardDefinition);
        }

        return EvaluateZoneRequirements(condition.InZoneRequirements, zoneCards);
    }

    private static List<CardInstance> GetZoneByEnum(PlayerZone zone, PlayerState playerInstance)
    {
        return zone switch
        {
            PlayerZone.CharacterField => playerInstance.Battlefield,
            PlayerZone.Deck => playerInstance.Deck,
            PlayerZone.Trash => playerInstance.DiscardPile,
            PlayerZone.Hand => playerInstance.Hand,
            PlayerZone.SupportZone => playerInstance.SupportZone,
            PlayerZone.ExileZone => playerInstance.ExileZone,
            _ => throw new ArgumentOutOfRangeException(nameof(zone), zone, null)
        };
    }

    private static bool EvaluateZoneRequirements(ZoneRequirementSet requirementSet, IReadOnlyList<Card> zoneCards)
    {
        var requirements = requirementSet.Requirements;
        if (requirements.Count == 0)
        {
            return true;
        }

        if (requirementSet.Operator == RequirementGroupOperator.Any)
        {
            return requirements.Any(requirement => RequirementIsSatisfied(requirement, zoneCards));
        }

        if (!requirementSet.DistinctCardsAcrossRequirements)
        {
            return requirements.All(requirement => RequirementIsSatisfied(requirement, zoneCards));
        }

        return RequirementsSatisfiedWithDistinctCards(requirements, zoneCards);
    }

    private static bool RequirementIsSatisfied(ZoneAmountRequirement requirement, IReadOnlyList<Card> zoneCards)
    {
        var matchCount = zoneCards.Count(card => CardMatchesRestriction(card, requirement.Restriction));
        return ComparisonMatches(requirement.Comparison, requirement.Amount, matchCount);
    }

    private static bool CardMatchesRestriction(Card cardDefinition, ZoneCardRestriction restriction)
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

    private static bool RequirementsSatisfiedWithDistinctCards(IReadOnlyList<ZoneAmountRequirement> requirements, IReadOnlyList<Card> zoneCards)
    {
        var candidateIndexesPerRequirement = requirements
            .Select(requirement => zoneCards
                .Select((card, index) => (card, index))
                .Where(tuple => CardMatchesRestriction(tuple.card, requirement.Restriction))
                .Select(tuple => tuple.index)
                .ToArray())
            .ToArray();

        var orderedRequirementIndexes = Enumerable.Range(0, requirements.Count)
            .OrderBy(index => candidateIndexesPerRequirement[index].Length)
            .ToArray();

        var usedCardIndexes = new HashSet<int>();
        return TrySatisfyDistinctRequirements(requirements, candidateIndexesPerRequirement, orderedRequirementIndexes, usedCardIndexes, 0);
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
