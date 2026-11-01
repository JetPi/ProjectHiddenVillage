using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class DeckRulesetRulesTests
{
    [TestMethod]
    public void Evaluate_CountsTheLeaderSeparatelyFromTheDeckSize()
    {
        var cards = BuildCards(50, maxCopies: 4);
        var catalog = BuildCatalog(cards);

        var evaluation = DeckRulesetRules.EvaluateRuleset(cards, catalog, CreateRuleset(50));

        Assert.IsTrue(evaluation.IsValid);
        Assert.AreEqual(1, evaluation.LeaderCopies);
        Assert.AreEqual(50, evaluation.NonLeaderCopies);
        Assert.AreEqual(0, evaluation.Violations.Count);
    }

    [TestMethod]
    public void Evaluate_ReportsDeckSizeWhenTheLeaderIsCountedByMistake()
    {
        var cards = BuildCards(49, maxCopies: 4);
        var catalog = BuildCatalog(cards);

        var evaluation = DeckRulesetRules.EvaluateRuleset(cards, catalog, CreateRuleset(50));

        Assert.IsFalse(evaluation.IsValid);
        var violation = evaluation.Violations.Single(item => item.Code == DeckRulesetRules.DeckSizeCode);
        Assert.AreEqual(50, violation.Expected);
        Assert.AreEqual(49, violation.Actual);
    }

    [TestMethod]
    public void Evaluate_RequiresExactlyOneLeaderRow()
    {
        var cards = BuildCards(50, maxCopies: 4, includeLeader: false);
        var catalog = BuildCatalog(cards);

        var evaluation = DeckRulesetRules.EvaluateRuleset(cards, catalog, CreateRuleset(50));

        CollectionAssert.Contains(
            evaluation.Violations.Select(violation => violation.Code).ToList(),
            DeckRulesetRules.LeaderCountCode);
    }

    [TestMethod]
    public void Evaluate_RequiresOneCopyOfTheLeader()
    {
        var cards = BuildCards(50, maxCopies: 4);
        cards = cards
            .Select(card => card.CardId == LeaderCardId ? card with { Quantity = 2 } : card)
            .ToList();
        var catalog = BuildCatalog(cards);

        var evaluation = DeckRulesetRules.EvaluateRuleset(cards, catalog, CreateRuleset(50));

        CollectionAssert.Contains(
            evaluation.Violations.Select(violation => violation.Code).ToList(),
            DeckRulesetRules.LeaderCopiesCode);
    }

    [TestMethod]
    public void Evaluate_ReportsCopiesAboveTheCap()
    {
        var cards = BuildCards(30, maxCopies: 3);
        cards = cards
            .Select(card => card.CardId == "C-001" ? card with { Quantity = 4 } : card)
            .ToList();
        var catalog = BuildCatalog(cards);

        var evaluation = DeckRulesetRules.EvaluateRuleset(cards, catalog, CreateRuleset(30, maxCopies: 3));

        var violation = evaluation.Violations.Single(item => item.Code == DeckRulesetRules.TooManyCopiesCode);
        Assert.AreEqual(3, violation.Max);
        Assert.AreEqual(4, violation.Actual);
    }

    [TestMethod]
    public void Evaluate_ReportsBannedCards()
    {
        var cards = BuildCards(30, maxCopies: 3);
        var catalog = BuildCatalog(cards);
        var restrictions = new Dictionary<string, int>(StringComparer.Ordinal)
        {
            ["C-001"] = 0,
        };

        var evaluation = DeckRulesetRules.EvaluateRuleset(
            cards,
            catalog,
            CreateRuleset(30, maxCopies: 3, restrictions: restrictions));

        var violation = evaluation.Violations.Single(item => item.Code == DeckRulesetRules.BannedCardCode);
        Assert.AreEqual("C-001", violation.CardIds);
    }

    [TestMethod]
    public void Evaluate_ReportsLimitedCardsWhenTheOverrideIsBelowTheCap()
    {
        var cards = BuildCards(30, maxCopies: 3);
        var catalog = BuildCatalog(cards);
        var restrictions = new Dictionary<string, int>(StringComparer.Ordinal)
        {
            ["C-001"] = 1,
        };

        var evaluation = DeckRulesetRules.EvaluateRuleset(
            cards,
            catalog,
            CreateRuleset(30, maxCopies: 3, restrictions: restrictions));

        var violation = evaluation.Violations.Single(item => item.Code == DeckRulesetRules.LimitedCardCode);
        Assert.AreEqual(1, violation.Max);
        Assert.AreEqual(3, violation.Actual);
    }

    [TestMethod]
    public void Evaluate_KeepsTheCapWhenTheOverrideIsHigher()
    {
        var cards = BuildCards(50, maxCopies: 4);
        var catalog = BuildCatalog(cards);
        var restrictions = new Dictionary<string, int>(StringComparer.Ordinal)
        {
            ["C-001"] = 9,
        };

        var evaluation = DeckRulesetRules.EvaluateRuleset(
            cards,
            catalog,
            CreateRuleset(50, maxCopies: 4, restrictions: restrictions));

        Assert.IsTrue(evaluation.IsValid);
    }

    [TestMethod]
    public void Evaluate_ReportsCardsOutsideTheLeaderColor()
    {
        var cards = BuildCards(50, maxCopies: 4);
        var catalog = BuildCatalog(cards);
        catalog["C-002"] = new DeckRuleCardMetadata("C-002", CardType.Character, CardColor.Blue);

        var evaluation = DeckRulesetRules.EvaluateRuleset(cards, catalog, CreateRuleset(50));

        var violation = evaluation.Violations.Single(item => item.Code == DeckRulesetRules.ColorMismatchCode);
        Assert.AreEqual("C-002", violation.CardIds);
        Assert.AreEqual("Red", violation.Color);
    }

    [TestMethod]
    public void Evaluate_ReportsUnknownCards()
    {
        var cards = BuildCards(50, maxCopies: 4);
        var catalog = BuildCatalog(cards);
        catalog.Remove("C-003");

        var evaluation = DeckRulesetRules.EvaluateRuleset(cards, catalog, CreateRuleset(50));

        var violation = evaluation.Violations.Single(item => item.Code == DeckRulesetRules.UnknownCardsCode);
        Assert.AreEqual("C-003", violation.CardIds);
    }

    [TestMethod]
    public void Evaluate_ReportsDisallowedCardTypes()
    {
        var cards = BuildCards(30, maxCopies: 3);
        cards = cards.Where(card => card.CardId != "C-001").ToList();
        cards.Add(new DeckRuleCard("K-001", 3));
        var catalog = BuildCatalog(cards);
        catalog["K-001"] = new DeckRuleCardMetadata("K-001", CardType.Chakra, CardColor.NotApplicable);

        var evaluation = DeckRulesetRules.EvaluateRuleset(cards, catalog, CreateRuleset(30, maxCopies: 3));

        var violation = evaluation.Violations.Single(item => item.Code == DeckRulesetRules.UnsupportedCardTypeCode);
        Assert.AreEqual("K-001", violation.CardIds);
    }

    [TestMethod]
    public void GetSetCode_TakesTheSegmentBeforeTheFirstDash()
    {
        Assert.AreEqual("SAMPLE", DeckRulesetRules.GetSetCode("SAMPLE-12"));
        Assert.AreEqual("N", DeckRulesetRules.GetSetCode("n-001"));
        Assert.AreEqual("PLAIN", DeckRulesetRules.GetSetCode("plain"));
    }

    [TestMethod]
    public void Evaluate_SetRuleBansEveryCardInThatSetOnly()
    {
        var cards = new List<DeckRuleCard>
        {
            new(LeaderCardId, 1),
            new("S-001", 1),
            new("SAMPLE-1", 3),
        };
        var catalog = BuildCatalog(cards);

        var evaluation = DeckRulesetRules.EvaluateRuleset(
            cards,
            catalog,
            CreateRuleset(
                nonLeaderCardCount: 4,
                setRestrictions: new Dictionary<string, int>(StringComparer.Ordinal) { ["S"] = 0 }));

        var banned = evaluation.Violations.Single(item => item.Code == DeckRulesetRules.BannedCardCode);
        Assert.AreEqual("S-001", banned.CardIds);
        Assert.IsFalse(
            evaluation.Violations.Any(item => item.CardIds?.Contains("SAMPLE", StringComparison.Ordinal) == true),
            "a set rule must not swallow a different set that merely starts with its code");
    }

    [TestMethod]
    public void Evaluate_CardRuleBeatsSetRule()
    {
        var cards = new List<DeckRuleCard>
        {
            new(LeaderCardId, 1),
            new("SAMPLE-1", 2),
            new("SAMPLE-3", 1),
        };
        var catalog = BuildCatalog(cards);

        var evaluation = DeckRulesetRules.EvaluateRuleset(
            cards,
            catalog,
            CreateRuleset(
                nonLeaderCardCount: 3,
                cardPoolMode: CardPoolMode.AllowList,
                restrictions: new Dictionary<string, int>(StringComparer.Ordinal) { ["SAMPLE-3"] = 0 },
                // The leader's own set has to be allowed too: a closed pool covers every card, leaders included.
                setRestrictions: new Dictionary<string, int>(StringComparer.Ordinal)
                {
                    ["SAMPLE"] = 3,
                    ["L"] = 4,
                }));

        Assert.AreEqual(1, evaluation.Violations.Count);
        Assert.AreEqual(DeckRulesetRules.BannedCardCode, evaluation.Violations[0].Code);
        Assert.AreEqual("SAMPLE-3", evaluation.Violations[0].CardIds);
    }

    [TestMethod]
    public void Evaluate_AllowListReportsCardsNoRuleAllows()
    {
        var cards = new List<DeckRuleCard>
        {
            new(LeaderCardId, 1),
            new("N-001", 2),
            new("X-001", 2),
        };
        var catalog = BuildCatalog(cards);

        var evaluation = DeckRulesetRules.EvaluateRuleset(
            cards,
            catalog,
            CreateRuleset(
                nonLeaderCardCount: 4,
                cardPoolMode: CardPoolMode.AllowList,
                setRestrictions: new Dictionary<string, int>(StringComparer.Ordinal)
                {
                    ["N"] = 4,
                    ["L"] = 4,
                }));

        var violation = evaluation.Violations.Single(item => item.Code == DeckRulesetRules.NotInCardPoolCode);
        Assert.AreEqual("X-001", violation.CardIds);
    }

    [TestMethod]
    public void Evaluate_ColorRuleIgnoresCardsWithoutAColor()
    {
        var cards = new List<DeckRuleCard>
        {
            new(LeaderCardId, 1),
            new("K-001", 1),
            new("C-001", 3),
        };
        var catalog = BuildCatalog(cards);
        catalog["K-001"] = new DeckRuleCardMetadata("K-001", CardType.Chakra, CardColor.NotApplicable);

        var evaluation = DeckRulesetRules.EvaluateRuleset(
            cards,
            catalog,
            CreateRuleset(nonLeaderCardCount: 4, maxCopies: 3, allowChakraCards: true));

        Assert.IsTrue(evaluation.IsValid);
    }

    [TestMethod]
    public void Evaluate_AllowsAFormatThatAcceptsTheDeckWhenAnotherDoesNot()
    {
        var cards = BuildCards(30, maxCopies: 3);
        var catalog = BuildCatalog(cards);
        var rulesets = new[]
        {
            CreateRuleset(50, maxCopies: 4, key: "standard", name: "Standard", id: StandardRulesetId),
            CreateRuleset(30, maxCopies: 3, key: "pre-release", name: "Pre-Release", id: PreReleaseRulesetId),
        };

        var validation = DeckRulesetRules.Evaluate(cards, catalog, rulesets);

        Assert.IsTrue(validation.IsLegalInAnyRuleset);
        Assert.AreEqual(2, validation.Evaluations.Count);
        Assert.IsFalse(validation.Evaluations[0].IsValid);
        Assert.IsTrue(validation.Evaluations[1].IsValid);
    }

    [TestMethod]
    public void Evaluate_ReportsNoLegalFormatWhenEveryRulesetFails()
    {
        var cards = BuildCards(10, maxCopies: 3);
        var catalog = BuildCatalog(cards);

        var validation = DeckRulesetRules.Evaluate(
            cards,
            catalog,
            [CreateRuleset(50, maxCopies: 4), CreateRuleset(30, maxCopies: 3, key: "pre-release", name: "Pre-Release")]);

        Assert.IsFalse(validation.IsLegalInAnyRuleset);
        Assert.IsTrue(validation.Evaluations.All(evaluation => !evaluation.IsValid));
    }

    private static readonly Guid StandardRulesetId = Guid.Parse("20000000-0000-0000-0000-000000000001");
    private static readonly Guid PreReleaseRulesetId = Guid.Parse("20000000-0000-0000-0000-000000000002");

    private const string LeaderCardId = "L-001";

    private static DeckRulesetDefinition CreateRuleset(
        int nonLeaderCardCount,
        int maxCopies = 4,
        string key = "standard",
        string name = "Standard",
        Guid? id = null,
        IReadOnlyDictionary<string, int>? restrictions = null,
        IReadOnlyDictionary<string, int>? setRestrictions = null,
        CardPoolMode cardPoolMode = CardPoolMode.Open,
        bool allowChakraCards = false,
        bool allowSummonCards = false)
    {
        var rules = new List<DeckRulesetCardRule>();

        foreach (var restriction in restrictions ?? new Dictionary<string, int>(StringComparer.Ordinal))
        {
            rules.Add(new DeckRulesetCardRule(CardRestrictionMatchType.Card, restriction.Key, restriction.Value));
        }

        foreach (var restriction in setRestrictions ?? new Dictionary<string, int>(StringComparer.Ordinal))
        {
            rules.Add(new DeckRulesetCardRule(CardRestrictionMatchType.Set, restriction.Key, restriction.Value));
        }

        return new DeckRulesetDefinition(
            Id: id ?? StandardRulesetId,
            Key: key,
            Name: name,
            AvailableInQuickMatch: true,
            LeaderCount: 1,
            NonLeaderCardCount: nonLeaderCardCount,
            MaxCopiesPerNonLeaderCard: maxCopies,
            RequireLeaderColorMatch: true,
            AllowChakraCards: allowChakraCards,
            AllowSummonCards: allowSummonCards,
            CardPoolMode: cardPoolMode,
            CardRules: rules,
            Clock: GameClockPolicy.Standard);
    }

    private static List<DeckRuleCard> BuildCards(int nonLeaderCount, int maxCopies, bool includeLeader = true)
    {
        var cards = new List<DeckRuleCard>();

        if (includeLeader)
        {
            cards.Add(new DeckRuleCard(LeaderCardId, 1));
        }

        var remaining = nonLeaderCount;
        var cardIndex = 1;

        while (remaining > 0)
        {
            var quantity = Math.Min(maxCopies, remaining);
            cards.Add(new DeckRuleCard($"C-{cardIndex:D3}", quantity));
            remaining -= quantity;
            cardIndex += 1;
        }

        return cards;
    }

    private static Dictionary<string, DeckRuleCardMetadata> BuildCatalog(IEnumerable<DeckRuleCard> cards)
    {
        var catalog = new Dictionary<string, DeckRuleCardMetadata>(StringComparer.Ordinal);

        foreach (var card in cards)
        {
            catalog[card.CardId] = card.CardId == LeaderCardId
                ? new DeckRuleCardMetadata(card.CardId, CardType.Leader, CardColor.Red)
                : new DeckRuleCardMetadata(card.CardId, CardType.Character, CardColor.Red);
        }

        return catalog;
    }
}
