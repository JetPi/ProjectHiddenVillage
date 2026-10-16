using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.CardArt;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class CardArtOrphanPolicyTests
{
    private static readonly TimeSpan Grace = TimeSpan.FromMinutes(60);
    private static readonly DateTimeOffset Now = new(2026, 10, 16, 12, 0, 0, TimeSpan.Zero);

    private const string CurrentVersion = "1750000000000";
    private const string SupersededVersion = "1740000000000";
    private const string FutureVersion = "1760000000000";

    [TestMethod]
    public void IsCollectableMaster_KeepsAMasterACardStillReferences()
    {
        var reference = CardArtSourceReference.BuildLocalReference("N-001");

        Assert.IsFalse(IsCollectableMaster(reference, [reference], Now.AddDays(-30)));
    }

    [TestMethod]
    public void IsCollectableMaster_ComparesReferencesCaseInsensitively()
    {
        // The write path trims and the read path upper-cases, so a casing difference must not read as "unused".
        var reference = CardArtSourceReference.BuildLocalReference("N-001");

        Assert.IsFalse(IsCollectableMaster(reference, [reference.ToUpperInvariant()], Now.AddDays(-30)));
    }

    [TestMethod]
    public void IsCollectableMaster_CollectsAnUnreferencedMasterPastTheGraceWindow()
    {
        Assert.IsTrue(IsCollectableMaster(
            CardArtSourceReference.BuildLocalReference("ABANDONED"),
            [],
            Now.AddMinutes(-90)));
    }

    [TestMethod]
    public void IsCollectableMaster_KeepsAnUnreferencedMasterInsideTheGraceWindow()
    {
        // This is the upload of a create request that has not landed yet.
        Assert.IsFalse(IsCollectableMaster(
            CardArtSourceReference.BuildLocalReference("IN-FLIGHT"),
            [],
            Now.AddMinutes(-5)));
    }

    [TestMethod]
    public void IsCollectableMaster_KeepsAFileStampedInTheFuture()
    {
        Assert.IsFalse(IsCollectableMaster(
            CardArtSourceReference.BuildLocalReference("CLOCK-SKEW"),
            [],
            Now.AddHours(2)));
    }

    [DataTestMethod]
    [DataRow("")]
    [DataRow("   ")]
    public void IsCollectableMaster_IgnoresAnEmptyReference(string reference)
    {
        Assert.IsFalse(IsCollectableMaster(reference, [], Now.AddDays(-30)));
    }

    [TestMethod]
    public void IsCollectableVariant_KeepsTheVariantAtTheCardsCurrentVersion()
    {
        Assert.IsFalse(IsCollectableVariant(
            "N-001",
            CurrentVersion,
            Now.AddDays(-30),
            ("N-001", CurrentVersion)));
    }

    [TestMethod]
    public void IsCollectableVariant_CollectsASupersededVersion()
    {
        // The leak this rule exists for: every card edit mints a new version, so a variant built for an older one
        // is never requested again - and before this rule it was never removed either.
        Assert.IsTrue(IsCollectableVariant(
            "N-001",
            SupersededVersion,
            Now.AddDays(-30),
            ("N-001", CurrentVersion)));
    }

    [TestMethod]
    public void IsCollectableVariant_KeepsASupersededVersionInsideTheGraceWindow()
    {
        Assert.IsFalse(IsCollectableVariant(
            "N-001",
            SupersededVersion,
            Now.AddMinutes(-1),
            ("N-001", CurrentVersion)));
    }

    [TestMethod]
    public void IsCollectableVariant_KeepsAVariantNewerThanTheCardsVersion()
    {
        // A client pinned to a version this server does not recognise must not cause a generate/delete loop.
        Assert.IsFalse(IsCollectableVariant(
            "N-001",
            FutureVersion,
            Now.AddDays(-30),
            ("N-001", CurrentVersion)));
    }

    [DataTestMethod]
    [DataRow("not-a-timestamp", CurrentVersion)]
    [DataRow(SupersededVersion, "not-a-timestamp")]
    [DataRow("", CurrentVersion)]
    [DataRow(SupersededVersion, "")]
    public void IsCollectableVariant_KeepsVersionsItCannotCompare(string variantVersion, string cardVersion)
    {
        Assert.IsFalse(IsCollectableVariant(
            "N-001",
            variantVersion,
            Now.AddDays(-30),
            ("N-001", cardVersion)));
    }

    [TestMethod]
    public void IsCollectableVariant_ComparesVersionsNumerically()
    {
        // Lexically "999" is greater than "1000"; as timestamps it is older. Ordering must not depend on length.
        Assert.IsTrue(IsCollectableVariant("N-001", "999", Now.AddDays(-30), ("N-001", "1000")));
        Assert.IsFalse(IsCollectableVariant("N-001", "1000", Now.AddDays(-30), ("N-001", "999")));
    }

    [TestMethod]
    public void IsCollectableVariant_CollectsVariantsOfDeletedCardsPastTheGraceWindow()
    {
        Assert.IsTrue(IsCollectableVariant(
            "N-404",
            CurrentVersion,
            Now.AddMinutes(-90),
            ("N-001", CurrentVersion)));
    }

    [TestMethod]
    public void IsCollectableVariant_KeepsVariantsOfDeletedCardsInsideTheGraceWindow()
    {
        Assert.IsFalse(IsCollectableVariant(
            "N-404",
            CurrentVersion,
            Now.AddMinutes(-1),
            ("N-001", CurrentVersion)));
    }

    [TestMethod]
    public void IsCollectableVariant_MatchesCardIdsCaseInsensitively()
    {
        Assert.IsFalse(IsCollectableVariant("n-001", CurrentVersion, Now.AddDays(-30), ("N-001", CurrentVersion)));
    }

    [DataTestMethod]
    [DataRow("card-art/N-001.webp")]
    [DataRow("../../etc/passwd")]
    [DataRow("")]
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

    [TestMethod]
    public void TryParseVariantFileName_RecoversAllThreeParts()
    {
        Assert.IsTrue(CardArtSourceReference.TryParseVariantFileName(
            "N-001__w240__v1750000000000.webp",
            out var cardId,
            out var width,
            out var version));

        Assert.AreEqual("N-001", cardId);
        Assert.AreEqual(240, width);
        Assert.AreEqual("1750000000000", version);
    }

    [DataTestMethod]
    [DataRow("N-001.webp")]
    [DataRow("N-001__w240.webp")]
    [DataRow("N-001__w__v1.webp")]
    [DataRow("N-001__w240__v.webp")]
    [DataRow("__w240__v1.webp")]
    [DataRow("N-001__wabc__v1.webp")]
    [DataRow("nested/N-001__w240__v1.webp")]
    [DataRow("")]
    public void TryParseVariantFileName_RejectsNamesThatAreNotVariants(string fileName)
    {
        Assert.IsFalse(CardArtSourceReference.TryParseVariantFileName(fileName, out var cardId, out var width, out var version));
        Assert.AreEqual(string.Empty, cardId);
        Assert.AreEqual(0, width);
        Assert.AreEqual(string.Empty, version);
    }

    [TestMethod]
    public void IsWellFormedLocalReference_AcceptsWhatBuildLocalReferenceProduces()
    {
        Assert.IsTrue(CardArtSourceReference.IsWellFormedLocalReference(
            CardArtSourceReference.BuildLocalReference("N-001")));
        Assert.IsTrue(CardArtSourceReference.IsWellFormedLocalReference("local:card-art/N-001.webp"));
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
    public void ResolveMasterWidth_CapsAtTheWidestConfiguredVariant()
    {
        var configured = new CardArtOptions { AllowedWidths = [80, 120, 240, 600] };
        var none = new CardArtOptions { AllowedWidths = [] };

        Assert.AreEqual(600, configured.ResolveMasterWidth());
        Assert.AreEqual(CardArtOptions.DefaultMasterWidth, none.ResolveMasterWidth());
    }

    private static bool IsCollectableMaster(string reference, string[] referenced, DateTimeOffset lastWrite)
    {
        return CardArtOrphanPolicy.IsCollectableMaster(
            reference,
            new HashSet<string>(referenced, StringComparer.OrdinalIgnoreCase),
            lastWrite,
            Now,
            Grace);
    }

    private static bool IsCollectableVariant(
        string cardId,
        string variantVersion,
        DateTimeOffset lastWrite,
        params (string CardId, string Version)[] cards)
    {
        var versionsByCardId = cards.ToDictionary(
            card => card.CardId,
            card => card.Version,
            StringComparer.OrdinalIgnoreCase);

        return CardArtOrphanPolicy.IsCollectableVariant(
            cardId,
            versionsByCardId,
            variantVersion,
            lastWrite,
            Now,
            Grace);
    }
}
