using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.CardArt;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class CardArtOrphanPolicyTests
{
    private static readonly TimeSpan Grace = TimeSpan.FromMinutes(60);
    private static readonly DateTimeOffset Now = new(2026, 10, 16, 12, 0, 0, TimeSpan.Zero);

    [TestMethod]
    public void IsCollectableMaster_KeepsAMasterACardStillReferences()
    {
        var reference = CardArtSourceReference.BuildLocalReference("N-001");

        Assert.IsFalse(IsCollectableMaster(reference, [reference], LastWrite: Now.AddDays(-30)));
    }

    [TestMethod]
    public void IsCollectableMaster_ComparesReferencesCaseInsensitively()
    {
        // The write path trims and the read path upper-cases, so a casing difference must not read as "unused".
        var reference = CardArtSourceReference.BuildLocalReference("N-001");

        Assert.IsFalse(IsCollectableMaster(reference, [reference.ToUpperInvariant()], LastWrite: Now.AddDays(-30)));
    }

    [TestMethod]
    public void IsCollectableMaster_CollectsAnUnreferencedMasterPastTheGraceWindow()
    {
        Assert.IsTrue(IsCollectableMaster(
            CardArtSourceReference.BuildLocalReference("ABANDONED"),
            [],
            LastWrite: Now.AddMinutes(-90)));
    }

    [TestMethod]
    public void IsCollectableMaster_KeepsAnUnreferencedMasterInsideTheGraceWindow()
    {
        // This is the upload of a create request that has not landed yet.
        Assert.IsFalse(IsCollectableMaster(
            CardArtSourceReference.BuildLocalReference("IN-FLIGHT"),
            [],
            LastWrite: Now.AddMinutes(-5)));
    }

    [TestMethod]
    public void IsCollectableMaster_KeepsAFileStampedInTheFuture()
    {
        Assert.IsFalse(IsCollectableMaster(
            CardArtSourceReference.BuildLocalReference("CLOCK-SKEW"),
            [],
            LastWrite: Now.AddHours(2)));
    }

    [DataTestMethod]
    [DataRow("")]
    [DataRow("   ")]
    public void IsCollectableMaster_IgnoresAnEmptyReference(string reference)
    {
        Assert.IsFalse(IsCollectableMaster(reference, [], LastWrite: Now.AddDays(-30)));
    }

    [TestMethod]
    public void IsCollectableVariant_KeepsVariantsOfCardsThatStillExist()
    {
        Assert.IsFalse(IsCollectableVariant("N-001", ["N-001"], LastWrite: Now.AddDays(-30)));
    }

    [TestMethod]
    public void IsCollectableVariant_CollectsVariantsOfDeletedCardsPastTheGraceWindow()
    {
        Assert.IsTrue(IsCollectableVariant("N-404", ["N-001"], LastWrite: Now.AddMinutes(-90)));
    }

    [TestMethod]
    public void IsCollectableVariant_KeepsVariantsOfDeletedCardsInsideTheGraceWindow()
    {
        Assert.IsFalse(IsCollectableVariant("N-404", ["N-001"], LastWrite: Now.AddMinutes(-1)));
    }

    [DataTestMethod]
    [DataRow("card-art/N-001.webp")]
    [DataRow("../../etc/passwd")]
    public void TryGetMasterCardId_RejectsNamesThatAreNotMasters(string fileName)
    {
        Assert.IsFalse(CardArtSourceReference.TryGetMasterCardId(fileName, out var cardId));
        Assert.AreEqual(string.Empty, cardId);
    }

    [TestMethod]
    public void TryGetMasterCardId_RecoversTheCardId()
    {
        Assert.IsTrue(CardArtSourceReference.TryGetMasterCardId("N-001.webp", out var cardId));
        Assert.AreEqual("N-001", cardId);
    }

    [DataTestMethod]
    [DataRow("local:card-art/N-001.webp")]
    [DataRow("local:card-art/N-001__.webp")]
    public void IsWellFormedLocalReference_AcceptsWhatBuildLocalReferenceProduces(string reference)
    {
        Assert.IsTrue(CardArtSourceReference.IsWellFormedLocalReference(reference));
        Assert.IsTrue(CardArtSourceReference.IsWellFormedLocalReference(
            CardArtSourceReference.BuildLocalReference("N-001")));
    }

    [DataTestMethod]
    [DataRow("local:")]
    [DataRow("local:card-art/")]
    [DataRow("local:card-art")]
    [DataRow("local:card-art/N-001.png")]
    [DataRow("local:card-art/nested/N-001.webp")]
    [DataRow("local:other/N-001.webp")]
    [DataRow("https://example.test/art.png")]
    [DataRow("")]
    public void IsWellFormedLocalReference_RejectsAnythingLooserThanTheRealShape(string reference)
    {
        // A validator that only asked "does it start with local:" would let the first few of these through.
        Assert.IsFalse(CardArtSourceReference.IsWellFormedLocalReference(reference));
    }

    [TestMethod]
    public void TryGetVariantCardId_RecoversTheCardIdFromAVariantName()
    {
        Assert.IsTrue(CardArtSourceReference.TryGetVariantCardId("N-001__w240__v1750000000000.webp", out var cardId));
        Assert.AreEqual("N-001", cardId);
    }

    [DataTestMethod]
    [DataRow("N-001.webp")]
    [DataRow("__w240.webp")]
    [DataRow("")]
    public void TryGetVariantCardId_RejectsNamesThatAreNotVariants(string fileName)
    {
        Assert.IsFalse(CardArtSourceReference.TryGetVariantCardId(fileName, out _));
    }

    private static bool IsCollectableMaster(string reference, string[] referenced, DateTimeOffset LastWrite)
    {
        return CardArtOrphanPolicy.IsCollectableMaster(
            reference,
            new HashSet<string>(referenced, StringComparer.OrdinalIgnoreCase),
            LastWrite,
            Now,
            Grace);
    }

    private static bool IsCollectableVariant(string cardId, string[] existingCardIds, DateTimeOffset LastWrite)
    {
        return CardArtOrphanPolicy.IsCollectableVariant(
            cardId,
            new HashSet<string>(existingCardIds, StringComparer.OrdinalIgnoreCase),
            LastWrite,
            Now,
            Grace);
    }
}
