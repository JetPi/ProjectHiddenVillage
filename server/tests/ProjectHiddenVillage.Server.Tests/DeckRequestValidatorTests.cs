using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class DeckRequestValidatorTests
{
    [TestMethod]
    public void Validate_AcceptsAWellFormedCreateRequest()
    {
        var result = ValidateCreate();

        Assert.IsTrue(result.IsValid, Describe(result));
    }

    [TestMethod]
    public void Validate_RejectsAMissingName()
    {
        var result = ValidateCreate(name: "   ");

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(result.Errors.Any(failure => failure.ErrorMessage.Contains("Deck name is required", StringComparison.Ordinal)), Describe(result));
    }

    [TestMethod]
    public void Validate_RejectsANameLongerThanTheColumn()
    {
        var result = ValidateCreate(name: new string('a', 129));

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(result.Errors.Any(failure => failure.ErrorMessage.Contains("128", StringComparison.Ordinal)), Describe(result));
    }

    [TestMethod]
    public void Validate_RejectsAnEmptyCardList()
    {
        var result = ValidateCreate(cards: []);

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(result.Errors.Any(failure => failure.ErrorMessage.Contains("at least one card", StringComparison.Ordinal)), Describe(result));
    }

    [TestMethod]
    public void Validate_RejectsDuplicateCardIdsIgnoringCase()
    {
        var result = ValidateCreate(cards:
        [
            new DeckCardRequest("N-001", 1),
            new DeckCardRequest("n-001", 1),
        ]);

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(result.Errors.Any(failure => failure.ErrorMessage.Contains("only once", StringComparison.Ordinal)), Describe(result));
    }

    [TestMethod]
    public void Validate_RejectsANonPositiveQuantity()
    {
        var result = ValidateCreate(cards: [new DeckCardRequest("N-001", 0)]);

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(result.Errors.Any(failure => failure.ErrorMessage.Contains("quantity", StringComparison.OrdinalIgnoreCase)), Describe(result));
    }

    [TestMethod]
    public void Validate_RejectsACardIdWithUnsupportedCharacters()
    {
        var result = ValidateCreate(cards: [new DeckCardRequest("N 001", 1)]);

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(result.Errors.Any(failure => failure.ErrorMessage.Contains("letters, digits", StringComparison.Ordinal)), Describe(result));
    }

    [TestMethod]
    public void Validate_UpdateUsesTheSameRulesAsCreate()
    {
        var result = new UpdateDeckRequestValidator().Validate(new UpdateDeckRequest(
            Name: "   ",
            Cards: [new DeckCardRequest("N-001", 1)]));

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(result.Errors.Any(failure => failure.ErrorMessage.Contains("Deck name is required", StringComparison.Ordinal)), Describe(result));
    }

    private static FluentValidation.Results.ValidationResult ValidateCreate(
        string name = "Test Deck",
        IReadOnlyList<DeckCardRequest>? cards = null)
    {
        return new CreatePublicDeckRequestValidator().Validate(new CreatePublicDeckRequest(
            Name: name,
            Cards: cards ?? [new DeckCardRequest("N-001", 1)]));
    }

    private static string Describe(FluentValidation.Results.ValidationResult result)
    {
        return result.IsValid
            ? "valid"
            : string.Join("; ", result.Errors.Select(failure => $"{failure.PropertyName}: {failure.ErrorMessage}"));
    }
}
