using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class PublicDeckRulesTests
{
    [TestMethod]
    public void Evaluate_AcceptsALeaderWithFourMatchingCopies()
    {
        var violations = PublicDeckRules.Evaluate(
            [
                new DeckRuleCard("L-001", 1),
                new DeckRuleCard("C-001", 4),
            ],
            Catalog(
                new DeckRuleCardMetadata("L-001", CardType.Leader, CardColor.Red),
                new DeckRuleCardMetadata("C-001", CardType.Character, CardColor.Red)));

        Assert.AreEqual(0, violations.Count, Describe(violations));
    }

    [TestMethod]
    public void Evaluate_RejectsADeckWithoutALeader()
    {
        var violations = PublicDeckRules.Evaluate(
            [new DeckRuleCard("C-001", 1)],
            Catalog(new DeckRuleCardMetadata("C-001", CardType.Character, CardColor.Red)));

        CollectionAssert.Contains(Codes(violations), PublicDeckRules.LeaderCountCode);
    }

    [TestMethod]
    public void Evaluate_RejectsTwoDifferentLeaders()
    {
        var violations = PublicDeckRules.Evaluate(
            [
                new DeckRuleCard("L-001", 1),
                new DeckRuleCard("L-002", 1),
            ],
            Catalog(
                new DeckRuleCardMetadata("L-001", CardType.Leader, CardColor.Red),
                new DeckRuleCardMetadata("L-002", CardType.Leader, CardColor.Blue)));

        CollectionAssert.Contains(Codes(violations), PublicDeckRules.LeaderCountCode);
    }

    [TestMethod]
    public void Evaluate_RejectsTwoCopiesOfTheLeader()
    {
        var violations = PublicDeckRules.Evaluate(
            [new DeckRuleCard("L-001", 2)],
            Catalog(new DeckRuleCardMetadata("L-001", CardType.Leader, CardColor.Red)));

        CollectionAssert.Contains(Codes(violations), PublicDeckRules.LeaderCopiesCode);
    }

    [TestMethod]
    public void Evaluate_RejectsAFifthCopyOfANonLeaderCard()
    {
        var violations = PublicDeckRules.Evaluate(
            [
                new DeckRuleCard("L-001", 1),
                new DeckRuleCard("C-001", PublicDeckRules.MaxNonLeaderCopies + 1),
            ],
            Catalog(
                new DeckRuleCardMetadata("L-001", CardType.Leader, CardColor.Red),
                new DeckRuleCardMetadata("C-001", CardType.Character, CardColor.Red)));

        CollectionAssert.Contains(Codes(violations), PublicDeckRules.TooManyCopiesCode);
    }

    [TestMethod]
    public void Evaluate_RejectsACardThatDoesNotMatchTheLeadersColour()
    {
        var violations = PublicDeckRules.Evaluate(
            [
                new DeckRuleCard("L-001", 1),
                new DeckRuleCard("C-001", 1),
            ],
            Catalog(
                new DeckRuleCardMetadata("L-001", CardType.Leader, CardColor.Red),
                new DeckRuleCardMetadata("C-001", CardType.Character, CardColor.Blue)));

        CollectionAssert.Contains(Codes(violations), PublicDeckRules.ColorMismatchCode);
    }

    [TestMethod]
    public void Evaluate_RejectsUnknownCardIds()
    {
        var violations = PublicDeckRules.Evaluate(
            [
                new DeckRuleCard("L-001", 1),
                new DeckRuleCard("N-999", 1),
            ],
            Catalog(new DeckRuleCardMetadata("L-001", CardType.Leader, CardColor.Red)));

        CollectionAssert.Contains(Codes(violations), PublicDeckRules.UnknownCardsCode);
    }

    [TestMethod]
    public void Evaluate_RejectsChakraAndSummonCards()
    {
        var violations = PublicDeckRules.Evaluate(
            [
                new DeckRuleCard("L-001", 1),
                new DeckRuleCard("K-001", 1),
                new DeckRuleCard("S-001", 1),
            ],
            Catalog(
                new DeckRuleCardMetadata("L-001", CardType.Leader, CardColor.Red),
                new DeckRuleCardMetadata("K-001", CardType.Chakra, CardColor.Red),
                new DeckRuleCardMetadata("S-001", CardType.Summon, CardColor.Red)));

        var unsupported = violations.Single(violation => violation.Code == PublicDeckRules.UnsupportedCardTypeCode);
        StringAssert.Contains(unsupported.Description, "K-001");
        StringAssert.Contains(unsupported.Description, "S-001");
    }

    [TestMethod]
    public void Evaluate_ReportsEveryViolationAtOnce()
    {
        var violations = PublicDeckRules.Evaluate(
            [
                new DeckRuleCard("C-001", 5),
                new DeckRuleCard("C-002", 1),
                new DeckRuleCard("N-999", 1),
            ],
            Catalog(
                new DeckRuleCardMetadata("C-001", CardType.Character, CardColor.Red),
                new DeckRuleCardMetadata("C-002", CardType.Character, CardColor.Blue)));

        var codes = Codes(violations);

        CollectionAssert.Contains(codes, PublicDeckRules.LeaderCountCode);
        CollectionAssert.Contains(codes, PublicDeckRules.TooManyCopiesCode);
        CollectionAssert.Contains(codes, PublicDeckRules.UnknownCardsCode);
    }

    [TestMethod]
    public void Evaluate_SkipsTheColourRuleWhenThereIsNoSingleLeader()
    {
        var violations = PublicDeckRules.Evaluate(
            [
                new DeckRuleCard("C-001", 1),
                new DeckRuleCard("C-002", 1),
            ],
            Catalog(
                new DeckRuleCardMetadata("C-001", CardType.Character, CardColor.Red),
                new DeckRuleCardMetadata("C-002", CardType.Character, CardColor.Blue)));

        CollectionAssert.DoesNotContain(Codes(violations), PublicDeckRules.ColorMismatchCode);
    }

    private static Dictionary<string, DeckRuleCardMetadata> Catalog(params DeckRuleCardMetadata[] entries)
    {
        return entries.ToDictionary(entry => entry.CardId, StringComparer.OrdinalIgnoreCase);
    }

    private static List<string> Codes(IReadOnlyList<DeckRuleViolation> violations)
    {
        return violations.Select(violation => violation.Code).ToList();
    }

    private static string Describe(IEnumerable<DeckRuleViolation> violations)
    {
        return string.Join("; ", violations.Select(violation => $"{violation.Code}: {violation.Description}"));
    }
}
