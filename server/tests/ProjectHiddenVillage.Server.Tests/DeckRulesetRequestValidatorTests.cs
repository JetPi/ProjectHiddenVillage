using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class DeckRulesetRequestValidatorTests
{
    [TestMethod]
    public void Validate_AcceptsAWellFormedRuleset()
    {
        var result = new CreateDeckRulesetRequestValidator().Validate(CreateRequest());

        Assert.IsTrue(result.IsValid, result.ToString());
    }

    [TestMethod]
    public void Validate_RejectsAKeyThatIsNotASlug()
    {
        var result = new CreateDeckRulesetRequestValidator().Validate(CreateRequest(key: "Standard Format"));

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(result.Errors.Any(error => error.PropertyName == nameof(CreateDeckRulesetRequest.Key)));
    }

    [TestMethod]
    public void Validate_RejectsALeaderCountOtherThanOne()
    {
        var result = new CreateDeckRulesetRequestValidator().Validate(CreateRequest(leaderCount: 2));

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(result.Errors.Any(error => error.PropertyName == nameof(CreateDeckRulesetRequest.LeaderCount)));
    }

    [TestMethod]
    public void Validate_RejectsADeckSizeBelowOne()
    {
        var result = new CreateDeckRulesetRequestValidator().Validate(CreateRequest(nonLeaderCardCount: 0));

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(result.Errors.Any(error => error.PropertyName == nameof(CreateDeckRulesetRequest.NonLeaderCardCount)));
    }

    [TestMethod]
    public void Validate_RejectsARestrictionAboveTheAllowedMaximum()
    {
        var result = new CreateDeckRulesetRequestValidator().Validate(CreateRequest(
            restrictions:
            [
                new DeckRulesetCardRestrictionRequest(CardRestrictionMatchType.Card, "C-001", 100),
            ]));

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(result.Errors.Any(error => error.PropertyName.Contains("MaxCopies")));
    }

    [TestMethod]
    public void Validate_RejectsDuplicateRuleMatchers()
    {
        var result = new CreateDeckRulesetRequestValidator().Validate(CreateRequest(
            restrictions:
            [
                new DeckRulesetCardRestrictionRequest(CardRestrictionMatchType.Card, "C-001", 0),
                new DeckRulesetCardRestrictionRequest(CardRestrictionMatchType.Card, "c-001", 2),
            ]));

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(result.Errors.Any(error => error.PropertyName == nameof(CreateDeckRulesetRequest.CardRestrictions)));
    }

    [TestMethod]
    public void Validate_AcceptsTheSameCodeAsBothACardRuleAndASetRule()
    {
        // A card code and a set code are separate match spaces, so "SAMPLE" can legitimately mean both.
        var result = new CreateDeckRulesetRequestValidator().Validate(CreateRequest(
            restrictions:
            [
                new DeckRulesetCardRestrictionRequest(CardRestrictionMatchType.Set, "SAMPLE", 0),
                new DeckRulesetCardRestrictionRequest(CardRestrictionMatchType.Card, "SAMPLE-1", 1),
            ]));

        Assert.IsTrue(result.IsValid, result.ToString());
    }

    [TestMethod]
    public void Validate_RejectsASetRuleThatContainsADash()
    {
        var result = new CreateDeckRulesetRequestValidator().Validate(CreateRequest(
            restrictions:
            [
                new DeckRulesetCardRestrictionRequest(CardRestrictionMatchType.Set, "SAMPLE-1", 0),
            ]));

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(result.Errors.Any(error => error.ErrorMessage.Contains("before the first dash")));
    }

    [TestMethod]
    public void Validate_AcceptsAWellFormedUpdate()
    {
        var result = new UpdateDeckRulesetRequestValidator().Validate(new UpdateDeckRulesetRequest(
            Name: "Standard",
            IsActive: true,
            CardPoolMode: CardPoolMode.Open,
            LeaderCount: 1,
            NonLeaderCardCount: 50,
            MaxCopiesPerNonLeaderCard: 4,
            RequireLeaderColorMatch: true,
            CardRestrictions: []));

        Assert.IsTrue(result.IsValid, result.ToString());
    }

    [TestMethod]
    public void Validate_RejectsAClockBudgetAboveThePlayerPool()
    {
        var result = new CreateDeckRulesetRequestValidator().Validate(
            CreateRequest() with { MainPhaseSeconds = 120, PlayerPoolSeconds = 60 });

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(
            result.Errors.Any(error => error.ErrorMessage.Contains("whole-game pool")),
            result.ToString());
    }

    [TestMethod]
    public void Validate_RejectsAClockWithNoAllowedTimeout()
    {
        var result = new CreateDeckRulesetRequestValidator().Validate(
            CreateRequest() with { TimeoutsBeforeForfeit = 0 });

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(
            result.Errors.Any(error => error.PropertyName == nameof(CreateDeckRulesetRequest.TimeoutsBeforeForfeit)),
            result.ToString());
    }

    [TestMethod]
    public void Validate_RejectsAnEmptyReorderRequest()
    {
        var result = new ReorderDeckRulesetsRequestValidator().Validate(
            new ReorderDeckRulesetsRequest([]));

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(result.Errors.Any(error => error.PropertyName == nameof(ReorderDeckRulesetsRequest.RulesetIds)));
    }

    [TestMethod]
    public void Validate_RejectsAFormatNamedTwiceInAReorderRequest()
    {
        var rulesetId = Guid.NewGuid();
        var result = new ReorderDeckRulesetsRequestValidator().Validate(
            new ReorderDeckRulesetsRequest([rulesetId, Guid.NewGuid(), rulesetId]));

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(result.Errors.Any(error => error.PropertyName == nameof(ReorderDeckRulesetsRequest.RulesetIds)));
    }

    [TestMethod]
    public void Validate_AcceptsAReorderRequest()
    {
        var result = new ReorderDeckRulesetsRequestValidator().Validate(
            new ReorderDeckRulesetsRequest([Guid.NewGuid(), Guid.NewGuid()]));

        Assert.IsTrue(result.IsValid, result.ToString());
    }

    private static CreateDeckRulesetRequest CreateRequest(
        string key = "standard",
        int leaderCount = 1,
        int nonLeaderCardCount = 50,
        IReadOnlyList<DeckRulesetCardRestrictionRequest>? restrictions = null,
        CardPoolMode cardPoolMode = CardPoolMode.Open)
    {
        return new CreateDeckRulesetRequest(
            Key: key,
            Name: "Standard",
            IsActive: true,
            CardPoolMode: cardPoolMode,
            LeaderCount: leaderCount,
            NonLeaderCardCount: nonLeaderCardCount,
            MaxCopiesPerNonLeaderCard: 4,
            RequireLeaderColorMatch: true,
            CardRestrictions: restrictions ?? []);
    }
}
