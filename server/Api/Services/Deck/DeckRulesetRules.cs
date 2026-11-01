namespace ProjectHiddenVillage.Server;

public sealed record DeckRuleCard(string CardId, int Quantity);

public sealed record DeckRuleCardMetadata(string CardId, CardType Type, CardColor Color);

/// <summary>
/// One card-pool rule of a ruleset, in the shape evaluation reads it. The rule names a code, never a catalogue
/// row, so it is evaluated by matching the code the deck line carries.
/// </summary>
public sealed record DeckRulesetCardRule(
    CardRestrictionMatchType MatchType,
    string Code,
    int MaxCopies);

public sealed record DeckRulesetDefinition(
    Guid Id,
    string Key,
    string Name,
    // Whether quick match may pair players on this format. Hosting, invites and joins ignore it: a host-only
    // format is still fully playable, it is simply never offered by the matchmaker.
    bool AvailableInQuickMatch,
    int LeaderCount,
    int NonLeaderCardCount,
    int MaxCopiesPerNonLeaderCard,
    bool RequireLeaderColorMatch,
    // How the rules below are read: restrictions on an open pool, or the definition of a closed one.
    CardPoolMode CardPoolMode,
    IReadOnlyList<DeckRulesetCardRule> CardRules,
    // The timing rules a game created under this ruleset plays under. It is carried with the definition because
    // creating a game reads exactly this object, and the clock must be snapshotted at that moment.
    GameClockPolicy Clock);

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
    public const string LeaderCountCode = "Deck.Ruleset.LeaderCount";
    public const string LeaderCopiesCode = "Deck.Ruleset.LeaderCopies";
    public const string DeckSizeCode = "Deck.Ruleset.DeckSize";
    public const string TooManyCopiesCode = "Deck.Ruleset.TooManyCopies";
    public const string BannedCardCode = "Deck.Ruleset.BannedCard";
    public const string LimitedCardCode = "Deck.Ruleset.LimitedCard";
    public const string NotInCardPoolCode = "Deck.Ruleset.NotInCardPool";
    public const string ColorMismatchCode = "Deck.Ruleset.ColorMismatch";

    /// <summary>
    /// The set a card belongs to: the text before the first dash, upper-cased. It is deliberately a segment
    /// comparison rather than a prefix test, because <c>S</c> is a prefix of <c>SAMPLE</c> and a set rule must
    /// never swallow a different set. A code with no dash is its own set.
    /// </summary>
    public static string GetSetCode(string cardId)
    {
        var normalizedCardId = cardId.Trim().ToUpperInvariant();
        var separatorIndex = normalizedCardId.IndexOf('-');

        return separatorIndex > 0 ? normalizedCardId[..separatorIndex] : normalizedCardId;
    }

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

        var cardRules = BuildRuleIndex(ruleset, CardRestrictionMatchType.Card);
        var setRules = BuildRuleIndex(ruleset, CardRestrictionMatchType.Set);

        AddRestrictionViolations(violations, leaders, ruleset, cardRules, setRules);
        AddRestrictionViolations(violations, nonLeaders, ruleset, cardRules, setRules);

        if (ruleset.RequireLeaderColorMatch && leaders.Count == 1)
        {
            var leaderColor = leaders[0].Metadata.Color;
            // Cards with no colour of their own - every Chakra and Summon card - cannot match a leader's colour
            // and are governed by the type flags instead. Comparing them would make an open format that allows
            // those card types legally unusable.
            var mismatchedCardIds = nonLeaders
                .Where(card => HasColor(card.Metadata.Color) && card.Metadata.Color != leaderColor)
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
        DeckRulesetDefinition ruleset,
        IReadOnlyDictionary<string, int> cardRules,
        IReadOnlyDictionary<string, int> setRules)
    {
        foreach (var card in cards)
        {
            // A rule naming the whole code always wins over a rule naming its set, so a single card can be
            // banned out of an otherwise allowed set, or exempted from a set-wide limit.
            var hasRule = cardRules.TryGetValue(card.CardId, out var restrictedMax)
                || setRules.TryGetValue(GetSetCode(card.CardId), out restrictedMax);

            if (!hasRule)
            {
                if (ruleset.CardPoolMode == CardPoolMode.AllowList)
                {
                    violations.Add(new DeckRuleViolation(
                        NotInCardPoolCode,
                        $"{card.CardId} is not part of this ruleset's card pool.",
                        CardIds: card.CardId));
                    continue;
                }

                // An open pool still caps copies: a rule is an override, never the only limit.
                if (card.Quantity > ruleset.MaxCopiesPerNonLeaderCard)
                {
                    violations.Add(new DeckRuleViolation(
                        TooManyCopiesCode,
                        $"{card.CardId} allows at most {ruleset.MaxCopiesPerNonLeaderCard} copies; this deck has {card.Quantity}.",
                        CardIds: card.CardId,
                        Max: ruleset.MaxCopiesPerNonLeaderCard,
                        Actual: card.Quantity));
                }

                continue;
            }

            if (restrictedMax <= 0)
            {
                violations.Add(new DeckRuleViolation(
                    BannedCardCode,
                    $"{card.CardId} is banned in this ruleset.",
                    CardIds: card.CardId,
                    Max: 0,
                    Actual: card.Quantity));
                continue;
            }

            var effectiveMax = Math.Min(ruleset.MaxCopiesPerNonLeaderCard, restrictedMax);

            if (card.Quantity <= effectiveMax)
            {
                continue;
            }

            if (restrictedMax < ruleset.MaxCopiesPerNonLeaderCard)
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

    private static Dictionary<string, int> BuildRuleIndex(
        DeckRulesetDefinition ruleset,
        CardRestrictionMatchType matchType)
    {
        var index = new Dictionary<string, int>(StringComparer.Ordinal);

        foreach (var rule in ruleset.CardRules)
        {
            if (rule.MatchType != matchType || string.IsNullOrWhiteSpace(rule.Code))
            {
                continue;
            }

            // The service refuses duplicates, so the last write only matters for a hand-built definition.
            index[rule.Code.Trim().ToUpperInvariant()] = rule.MaxCopies;
        }

        return index;
    }

    private static bool HasColor(CardColor color)
    {
        return color != CardColor.NotApplicable;
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
