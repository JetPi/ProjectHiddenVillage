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
            restrictions: [new DeckRulesetCardRestrictionRequest("C-001", 100)]));

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(result.Errors.Any(error => error.PropertyName.Contains("MaxCopies")));
    }

    [TestMethod]
    public void Validate_RejectsDuplicateRestrictionCardIds()
    {
        var result = new CreateDeckRulesetRequestValidator().Validate(CreateRequest(
            restrictions:
            [
                new DeckRulesetCardRestrictionRequest("C-001", 0),
                new DeckRulesetCardRestrictionRequest("c-001", 2),
            ]));

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(result.Errors.Any(error => error.PropertyName == nameof(CreateDeckRulesetRequest.CardRestrictions)));
    }

    [TestMethod]
    public void Validate_AcceptsAWellFormedUpdate()
    {
        var result = new UpdateDeckRulesetRequestValidator().Validate(new UpdateDeckRulesetRequest(
            Name: "Standard",
            IsActive: true,
            LeaderCount: 1,
            NonLeaderCardCount: 50,
            MaxCopiesPerNonLeaderCard: 4,
            RequireLeaderColorMatch: true,
            AllowChakraCards: false,
            AllowSummonCards: false,
            SortOrder: 0,
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

    private static CreateDeckRulesetRequest CreateRequest(
        string key = "standard",
        int leaderCount = 1,
        int nonLeaderCardCount = 50,
        IReadOnlyList<DeckRulesetCardRestrictionRequest>? restrictions = null)
    {
        return new CreateDeckRulesetRequest(
            Key: key,
            Name: "Standard",
            IsActive: true,
            LeaderCount: leaderCount,
            NonLeaderCardCount: nonLeaderCardCount,
            MaxCopiesPerNonLeaderCard: 4,
            RequireLeaderColorMatch: true,
            AllowChakraCards: false,
            AllowSummonCards: false,
            SortOrder: 0,
            CardRestrictions: restrictions ?? []);
    }
}
