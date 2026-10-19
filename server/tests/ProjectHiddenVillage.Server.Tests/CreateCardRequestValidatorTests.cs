using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.CardArt;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class CreateCardRequestValidatorTests
{
    private const string CardId = "BM-NEW-001";

    [TestMethod]
    public void Validate_AcceptsAMinimalCardWithNoArtAndNoEffects()
    {
        var result = Validate(CreateRequest());

        Assert.IsTrue(
            result.IsValid,
            $"A brand new card should be creatable without effects: {Describe(result)}");
    }

    [TestMethod]
    public void Validate_AcceptsAnExternalImageUrl()
    {
        var result = Validate(CreateRequest(image: "https://example.test/art/BM-NEW-001.png"));

        Assert.IsTrue(result.IsValid, Describe(result));
    }

    [TestMethod]
    public void Validate_AcceptsTheLocalReferenceForItsOwnCardId()
    {
        var result = Validate(CreateRequest(
            image: CardArtSourceReference.BuildLocalReference(CardId)));

        Assert.IsTrue(result.IsValid, Describe(result));
    }

    [TestMethod]
    public void Validate_RejectsALocalReferenceBelongingToAnotherCard()
    {
        // Otherwise one card could claim another card's stored master.
        var result = Validate(CreateRequest(
            image: CardArtSourceReference.BuildLocalReference("BM-OTHER-001")));

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(
            result.Errors.Any(failure => failure.ErrorMessage.Contains("local card art reference", StringComparison.Ordinal)),
            Describe(result));
    }

    [TestMethod]
    public void Validate_RejectsAnImageThatIsNeitherAUrlNorALocalReference()
    {
        var result = Validate(CreateRequest(image: "card-art/BM-NEW-001.webp"));

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(
            result.Errors.Any(failure => failure.ErrorMessage.Contains("http(s) URL", StringComparison.Ordinal)),
            Describe(result));
    }

    [DataTestMethod]
    [DataRow("")]
    [DataRow("   ")]
    [DataRow("BM/001")]
    [DataRow("BM:001")]
    [DataRow("../BM-001")]
    [DataRow("BM 001")]
    public void Validate_RejectsACardIdThatCannotBeAPathSegment(string cardId)
    {
        var result = Validate(CreateRequest(cardId: cardId));

        Assert.IsFalse(result.IsValid, $"Card id '{cardId}' should not be accepted.");
    }

    [TestMethod]
    public void Validate_RejectsACardIdOverTheColumnLength()
    {
        var result = Validate(CreateRequest(cardId: new string('A', 65)));

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(
            result.Errors.Any(failure => failure.ErrorMessage.Contains("cannot exceed", StringComparison.Ordinal)),
            Describe(result));
    }

    [TestMethod]
    public void Validate_RejectsADisplayNameOverTheColumnLength()
    {
        var result = Validate(CreateRequest(displayName: new string('A', 257)));

        Assert.IsFalse(result.IsValid);
    }

    [TestMethod]
    public void Validate_RejectsATypeThatIsNotACardType()
    {
        var result = Validate(CreateRequest(type: "Nonsense"));

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(
            result.Errors.Any(failure => failure.ErrorMessage.Contains("Type must be one of", StringComparison.Ordinal)),
            Describe(result));
    }

    [TestMethod]
    public void Validate_RejectsAColorThatIsNotACardColor()
    {
        var result = Validate(CreateRequest(color: "Purple"));

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(
            result.Errors.Any(failure => failure.ErrorMessage.Contains("Color must be one of", StringComparison.Ordinal)),
            Describe(result));
    }

    [TestMethod]
    public void Validate_RejectsBothLifeAndHealthInTheSameRequest()
    {
        var result = Validate(CreateRequest(type: "Leader", life: 8, health: 8));

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(
            result.Errors.Any(failure => failure.ErrorMessage.Contains("Life and Health", StringComparison.Ordinal)),
            Describe(result));
    }

    [TestMethod]
    public void Validate_RejectsHealthOnALeader()
    {
        var result = Validate(CreateRequest(type: "Leader", health: 9));

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(
            result.Errors.Any(failure => failure.ErrorMessage.Contains("Health can only be patched", StringComparison.Ordinal)),
            Describe(result));
    }

    [TestMethod]
    public void Validate_RejectsEffectsWithDuplicateIds()
    {
        // The create flow inherits the update flow's effect rules rather than restating them.
        var result = Validate(CreateRequest(effects:
        [
            CreateEffect("effect-1"),
            CreateEffect("effect-1"),
        ]));

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(
            result.Errors.Any(failure => failure.ErrorMessage.Contains("Effect ids must be unique", StringComparison.Ordinal)),
            Describe(result));
    }

    [TestMethod]
    public void Validate_RejectsAnEffectWithoutAnId()
    {
        var result = Validate(CreateRequest(effects: [CreateEffect(string.Empty)]));

        Assert.IsFalse(result.IsValid);
    }

    [TestMethod]
    public void Validate_RejectsMoreNameEntriesThanTheAuthoringCap()
    {
        var result = Validate(CreateRequest(name: Enumerable.Range(0, 33).Select(index => $"name-{index}").ToList()));

        Assert.IsFalse(result.IsValid);
    }

    private static CreateCardRequest CreateRequest(
        string cardId = CardId,
        string displayName = "Hidden Village Striker",
        string? image = null,
        string? type = "Character",
        string? color = "Red",
        int? life = null,
        int? health = 4,
        IReadOnlyList<string>? name = null,
        IReadOnlyList<EffectSpec>? effects = null)
    {
        return new CreateCardRequest(
            CardId: cardId,
            DisplayName: displayName,
            Image: image,
            Name: name,
            MainAlternate: null,
            Traits: null,
            Type: type,
            Color: color,
            Description: "A card authored through the admin create screen.",
            SupportEffect: null,
            SupportName: null,
            CannotBeNormalSummoned: null,
            Conditions: null,
            Effects: effects,
            Power: 3,
            Damage: 2,
            Life: life,
            Health: health);
    }

    /// <summary>
    /// The same effect shape the update validator's own tests use. These tests only care that the create request
    /// reaches the shared effect rules at all, so the payload is deliberately minimal.
    /// </summary>
    private static EffectSpec CreateEffect(string id)
    {
        return new EffectSpec
        {
            Id = id,
            RuntimeEffectType = RuntimeEffects.Tribute,
            EffectType = EffectKind.SummonRequirement,
            Timing = EffectTiming.OnSummon,
            DurationMode = EffectDurationMode.Instant,
            TargetRange = EffectTargetRange.Self,
            ContextRules = [],
            TargetRules = new EffectTargetRuleSet(),
        };
    }

    private static FluentValidation.Results.ValidationResult Validate(CreateCardRequest request)
    {
        return new CreateCardRequestValidator().Validate(request);
    }

    private static string Describe(FluentValidation.Results.ValidationResult result)
    {
        return string.Join(" | ", result.Errors.Select(failure => $"{failure.PropertyName}: {failure.ErrorMessage}"));
    }
}
