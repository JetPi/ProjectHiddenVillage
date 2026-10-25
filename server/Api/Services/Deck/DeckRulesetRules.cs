namespace ProjectHiddenVillage.Server;

public sealed record DeckRuleCard(string CardId, int Quantity);

public sealed record DeckRuleCardMetadata(string CardId, CardType Type, CardColor Color);

public sealed record DeckRulesetDefinition(
    Guid Id,
    string Key,
    string Name,
    int LeaderCount,
    int NonLeaderCardCount,
    int MaxCopiesPerNonLeaderCard,
    bool RequireLeaderColorMatch,
    bool AllowChakraCards,
    bool AllowSummonCards,
    IReadOnlyDictionary<string, int> MaxCopiesByCardId);

public sealed record DeckRuleViolation(
    string Code,
    string Description,
    string? CardIds = null,
    int? Expected = null,
    int? Actual = null,
    int? Max = null,
    string? Color = null);

public sealed record DeckRulesetEvaluation(
    Guid RulesetId,
    string Key,
    string Name,
    bool IsValid,
    IReadOnlyList<DeckRuleViolation> Violations,
    int LeaderCopies,
    int NonLeaderCopies);

public sealed record DeckRulesetValidation(
    bool IsLegalInAnyRuleset,
    IReadOnlyList<DeckRulesetEvaluation> Evaluations);

public static class DeckRulesetRules
{
    public const string UnknownCardsCode = "Deck.Ruleset.UnknownCards";
    public const string UnsupportedCardTypeCode = "Deck.Ruleset.UnsupportedCardType";
    public const string LeaderCountCode = "Deck.Ruleset.LeaderCount";
    public const string LeaderCopiesCode = "Deck.Ruleset.LeaderCopies";
    public const string DeckSizeCode = "Deck.Ruleset.DeckSize";
    public const string TooManyCopiesCode = "Deck.Ruleset.TooManyCopies";
    public const string BannedCardCode = "Deck.Ruleset.BannedCard";
    public const string LimitedCardCode = "Deck.Ruleset.LimitedCard";
    public const string ColorMismatchCode = "Deck.Ruleset.ColorMismatch";

    public static DeckRulesetValidation Evaluate(
        IEnumerable<DeckRuleCard> cards,
        IReadOnlyDictionary<string, DeckRuleCardMetadata> catalogByCardId,
        IEnumerable<DeckRulesetDefinition> rulesets)
    {
        ArgumentNullException.ThrowIfNull(cards);
        ArgumentNullException.ThrowIfNull(catalogByCardId);
        ArgumentNullException.ThrowIfNull(rulesets);

        var normalizedCards = NormalizeCards(cards);
        var catalog = new Dictionary<string, DeckRuleCardMetadata>(StringComparer.OrdinalIgnoreCase);

        foreach (var entry in catalogByCardId)
        {
            catalog[entry.Key] = entry.Value;
        }

        var evaluations = rulesets
            .Where(ruleset => ruleset is not null)
            .Select(ruleset => EvaluateRuleset(normalizedCards, catalog, ruleset))
            .ToList();

        return new DeckRulesetValidation(
            IsLegalInAnyRuleset: evaluations.Any(evaluation => evaluation.IsValid),
            Evaluations: evaluations);
    }

    public static DeckRulesetEvaluation EvaluateRuleset(
        IEnumerable<DeckRuleCard> cards,
        IReadOnlyDictionary<string, DeckRuleCardMetadata> catalogByCardId,
        DeckRulesetDefinition ruleset)
    {
        ArgumentNullException.ThrowIfNull(cards);
        ArgumentNullException.ThrowIfNull(catalogByCardId);
        ArgumentNullException.ThrowIfNull(ruleset);

        var normalizedCards = NormalizeCards(cards);
        var catalog = new Dictionary<string, DeckRuleCardMetadata>(StringComparer.OrdinalIgnoreCase);

        foreach (var entry in catalogByCardId)
        {
            catalog[entry.Key] = entry.Value;
        }

        var violations = new List<DeckRuleViolation>();

        var unknownCardIds = normalizedCards
            .Where(card => !catalog.ContainsKey(card.CardId))
            .Select(card => card.CardId)
            .OrderBy(cardId => cardId, StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (unknownCardIds.Count > 0)
        {
            violations.Add(new DeckRuleViolation(
                UnknownCardsCode,
                $"Unknown card id(s): {string.Join(", ", unknownCardIds)}.",
                CardIds: string.Join(", ", unknownCardIds)));
        }

        var knownCards = normalizedCards
            .Where(card => catalog.ContainsKey(card.CardId))
            .Select(card => new KnownDeckCard(card.CardId, card.Quantity, catalog[card.CardId]))
            .ToList();

        var prohibitedCards = knownCards
            .Where(card => IsProhibitedType(card.Metadata.Type, ruleset))
            .Select(card => card.CardId)
            .OrderBy(cardId => cardId, StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (prohibitedCards.Count > 0)
        {
            violations.Add(new DeckRuleViolation(
                UnsupportedCardTypeCode,
                $"This ruleset does not allow Chakra or Summon cards: {string.Join(", ", prohibitedCards)}.",
                CardIds: string.Join(", ", prohibitedCards)));
        }

        var leaders = knownCards
            .Where(card => card.Metadata.Type == CardType.Leader)
            .ToList();
        var nonLeaders = knownCards
            .Where(card => card.Metadata.Type != CardType.Leader)
            .ToList();

        var leaderCopies = leaders.Sum(card => card.Quantity);
        var nonLeaderCopies = nonLeaders.Sum(card => card.Quantity);

        if (leaders.Count != ruleset.LeaderCount)
        {
            violations.Add(new DeckRuleViolation(
                LeaderCountCode,
                $"This ruleset needs exactly {ruleset.LeaderCount} leader card(s); this deck has {leaders.Count}.",
                Expected: ruleset.LeaderCount,
                Actual: leaders.Count));
        }

        foreach (var leader in leaders.Where(card => card.Quantity != 1))
        {
            violations.Add(new DeckRuleViolation(
                LeaderCopiesCode,
                $"{leader.CardId} must have exactly one copy, not {leader.Quantity}.",
                CardIds: leader.CardId,
                Expected: 1,
                Actual: leader.Quantity));
        }

        if (nonLeaderCopies != ruleset.NonLeaderCardCount)
        {
            violations.Add(new DeckRuleViolation(
                DeckSizeCode,
                $"This ruleset needs exactly {ruleset.NonLeaderCardCount} non-leader cards; this deck has {nonLeaderCopies}.",
                Expected: ruleset.NonLeaderCardCount,
                Actual: nonLeaderCopies));
        }

        AddRestrictionViolations(violations, leaders, ruleset);
        AddRestrictionViolations(violations, nonLeaders, ruleset);

        if (ruleset.RequireLeaderColorMatch && leaders.Count == 1)
        {
            var leaderColor = leaders[0].Metadata.Color;
            var mismatchedCardIds = nonLeaders
                .Where(card => card.Metadata.Color != leaderColor)
                .Select(card => card.CardId)
                .OrderBy(cardId => cardId, StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (mismatchedCardIds.Count > 0)
            {
                violations.Add(new DeckRuleViolation(
                    ColorMismatchCode,
                    $"Every card must match the leader's colour ({ToReadableColor(leaderColor)}); "
                    + $"{string.Join(", ", mismatchedCardIds)} do not.",
                    CardIds: string.Join(", ", mismatchedCardIds),
                    Color: ToReadableColor(leaderColor)));
            }
        }

        return new DeckRulesetEvaluation(
            ruleset.Id,
            ruleset.Key,
            ruleset.Name,
            IsValid: violations.Count == 0,
            Violations: violations,
            LeaderCopies: leaderCopies,
            NonLeaderCopies: nonLeaderCopies);
    }

    private static void AddRestrictionViolations(
        List<DeckRuleViolation> violations,
        IReadOnlyList<KnownDeckCard> cards,
        DeckRulesetDefinition ruleset)
    {
        foreach (var card in cards)
        {
            var hasRestriction = ruleset.MaxCopiesByCardId.TryGetValue(card.CardId, out var restrictedMax);

            if (hasRestriction && restrictedMax <= 0)
            {
                violations.Add(new DeckRuleViolation(
                    BannedCardCode,
                    $"{card.CardId} is banned in this ruleset.",
                    CardIds: card.CardId,
                    Max: 0,
                    Actual: card.Quantity));
                continue;
            }

            var effectiveMax = hasRestriction
                ? Math.Min(ruleset.MaxCopiesPerNonLeaderCard, restrictedMax)
                : ruleset.MaxCopiesPerNonLeaderCard;

            if (card.Quantity <= effectiveMax)
            {
                continue;
            }

            if (hasRestriction && restrictedMax < ruleset.MaxCopiesPerNonLeaderCard)
            {
                violations.Add(new DeckRuleViolation(
                    LimitedCardCode,
                    $"{card.CardId} is limited to {restrictedMax} copies in this ruleset; this deck has {card.Quantity}.",
                    CardIds: card.CardId,
                    Max: effectiveMax,
                    Actual: card.Quantity));
            }
            else
            {
                violations.Add(new DeckRuleViolation(
                    TooManyCopiesCode,
                    $"{card.CardId} allows at most {effectiveMax} copies; this deck has {card.Quantity}.",
                    CardIds: card.CardId,
                    Max: effectiveMax,
                    Actual: card.Quantity));
            }
        }
    }

    private static bool IsProhibitedType(CardType type, DeckRulesetDefinition ruleset)
    {
        return type switch
        {
            CardType.Chakra => !ruleset.AllowChakraCards,
            CardType.Summon => !ruleset.AllowSummonCards,
            _ => false,
        };
    }

    private static List<DeckRuleCard> NormalizeCards(IEnumerable<DeckRuleCard> cards)
    {
        return cards
            .Where(card => !string.IsNullOrWhiteSpace(card.CardId))
            .Select(card => new DeckRuleCard(card.CardId.Trim().ToUpperInvariant(), card.Quantity))
            .GroupBy(card => card.CardId, StringComparer.Ordinal)
            .Select(group => new DeckRuleCard(group.Key, group.Sum(card => card.Quantity)))
            .Where(card => card.Quantity > 0)
            .OrderBy(card => card.CardId, StringComparer.Ordinal)
            .ToList();
    }

    private static string ToReadableColor(CardColor color)
    {
        return color == CardColor.NotApplicable ? "N/A" : color.ToString();
    }

    private sealed record KnownDeckCard(string CardId, int Quantity, DeckRuleCardMetadata Metadata);
}
