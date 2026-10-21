namespace ProjectHiddenVillage.Server;

public sealed record DeckRuleCard(string CardId, int Quantity);

public sealed record DeckRuleCardMetadata(string CardId, CardType Type, CardColor Color);

public sealed record DeckRuleViolation(string Code, string Description);

public static class PublicDeckRules
{
    public const int MaxNonLeaderCopies = 4;

    public const string UnknownCardsCode = "Deck.Public.UnknownCards";
    public const string UnsupportedCardTypeCode = "Deck.Public.UnsupportedCardType";
    public const string LeaderCountCode = "Deck.Public.LeaderCount";
    public const string LeaderCopiesCode = "Deck.Public.LeaderCopies";
    public const string TooManyCopiesCode = "Deck.Public.TooManyCopies";
    public const string ColorMismatchCode = "Deck.Public.ColorMismatch";

    public static IReadOnlyList<DeckRuleViolation> Evaluate(
        IEnumerable<DeckRuleCard> cards,
        IReadOnlyDictionary<string, DeckRuleCardMetadata> catalogByCardId)
    {
        ArgumentNullException.ThrowIfNull(cards);
        ArgumentNullException.ThrowIfNull(catalogByCardId);

        var violations = new List<DeckRuleViolation>();
        var requestedCards = cards
            .Where(card => !string.IsNullOrWhiteSpace(card.CardId))
            .Select(card => new DeckRuleCard(card.CardId.Trim(), card.Quantity))
            .ToList();

        var unknownCardIds = requestedCards
            .Where(card => !catalogByCardId.ContainsKey(card.CardId))
            .Select(card => card.CardId)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(cardId => cardId, StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (unknownCardIds.Count > 0)
        {
            violations.Add(new DeckRuleViolation(
                UnknownCardsCode,
                $"Unknown card id(s): {string.Join(", ", unknownCardIds)}."));
        }

        var knownCards = requestedCards
            .Select(card => new
            {
                Card = card,
                Metadata = catalogByCardId.TryGetValue(card.CardId, out var metadata) ? metadata : null,
            })
            .Where(entry => entry.Metadata is not null)
            .ToList();

        var prohibitedCards = knownCards
            .Where(entry => entry.Metadata!.Type is CardType.Chakra or CardType.Summon)
            .Select(entry => entry.Card.CardId)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(cardId => cardId, StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (prohibitedCards.Count > 0)
        {
            violations.Add(new DeckRuleViolation(
                UnsupportedCardTypeCode,
                $"Decks cannot include Chakra or Summon cards: {string.Join(", ", prohibitedCards)}."));
        }

        var leaders = knownCards
            .Where(entry => entry.Metadata!.Type == CardType.Leader)
            .ToList();

        if (leaders.Count != 1)
        {
            violations.Add(new DeckRuleViolation(
                LeaderCountCode,
                $"A deck needs exactly one leader card; this deck has {leaders.Count}."));
        }
        else
        {
            var leader = leaders[0];

            if (leader.Card.Quantity != 1)
            {
                violations.Add(new DeckRuleViolation(
                    LeaderCopiesCode,
                    $"A deck has exactly one copy of its leader card; {leader.Card.CardId} asks for {leader.Card.Quantity}."));
            }

            var leaderCardId = leader.Card.CardId;
            var leaderColor = leader.Metadata!.Color;
            var mismatchedCardIds = knownCards
                .Where(entry =>
                    !string.Equals(entry.Card.CardId, leaderCardId, StringComparison.OrdinalIgnoreCase)
                    && entry.Metadata!.Color != leaderColor)
                .Select(entry => entry.Card.CardId)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(cardId => cardId, StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (mismatchedCardIds.Count > 0)
            {
                violations.Add(new DeckRuleViolation(
                    ColorMismatchCode,
                    $"Every card must match the leader's colour ({ToReadableColor(leaderColor)}); "
                    + $"{string.Join(", ", mismatchedCardIds)} do not."));
            }
        }

        var overCopiedCards = knownCards
            .Where(entry => entry.Metadata!.Type != CardType.Leader && entry.Card.Quantity > MaxNonLeaderCopies)
            .Select(entry => $"{entry.Card.CardId} ({entry.Card.Quantity})")
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(entry => entry, StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (overCopiedCards.Count > 0)
        {
            violations.Add(new DeckRuleViolation(
                TooManyCopiesCode,
                $"No more than {MaxNonLeaderCopies} copies of a non-leader card are allowed: "
                + $"{string.Join(", ", overCopiedCards)}."));
        }

        return violations;
    }

    private static string ToReadableColor(CardColor color)
    {
        return color == CardColor.NotApplicable ? "N/A" : color.ToString();
    }
}
