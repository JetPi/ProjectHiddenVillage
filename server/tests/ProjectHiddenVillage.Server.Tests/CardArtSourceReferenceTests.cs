using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.CardArt;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class CardArtSourceReferenceTests
{
    private const string ArtRoot = "/srv/hidden-village/card-art-uploads";

    [TestMethod]
    public void BuildLocalReference_NamesTheCardInsideTheArtFolder()
    {
        var reference = CardArtSourceReference.BuildLocalReference("BM-001");

        Assert.AreEqual("local:card-art/BM-001.webp", reference);
        Assert.IsTrue(CardArtSourceReference.IsLocal(reference));
    }

    [DataTestMethod]
    [DataRow(null)]
    [DataRow("")]
    [DataRow("   ")]
    [DataRow("https://example.test/art.png")]
    [DataRow("card-art/BM-001.webp")]
    public void IsLocal_OnlyAcceptsTheLocalPrefix(string? reference)
    {
        Assert.IsFalse(CardArtSourceReference.IsLocal(reference));
    }

    [TestMethod]
    public void TryResolveLocalPath_ResolvesInsideTheArtRoot()
    {
        var resolved = CardArtSourceReference.TryResolveLocalPath(
            CardArtSourceReference.BuildLocalReference("BM-001"),
            ArtRoot,
            out var fullPath);

        Assert.IsTrue(resolved);
        Assert.AreEqual(Path.GetFullPath(Path.Combine(ArtRoot, "card-art", "BM-001.webp")), fullPath);
    }

    [DataTestMethod]
    [DataRow("local:card-art/../../appsettings.json")]
    [DataRow("local:card-art/../../../etc/passwd")]
    [DataRow("local:card-art/..\\..\\appsettings.json")]
    [DataRow("local:../../appsettings.json")]
    [DataRow("local:/etc/passwd")]
    [DataRow("local:")]
    [DataRow("local:card-art/")]
    public void TryResolveLocalPath_RejectsAnythingThatEscapesTheArtRoot(string reference)
    {
        // The reference is read out of the database and joined into a filesystem path, so the guard is the one
        // thing standing between a bad row and an arbitrary file read.
        var resolved = CardArtSourceReference.TryResolveLocalPath(reference, ArtRoot, out var fullPath);

        Assert.IsFalse(resolved, $"'{reference}' must not resolve.");
        Assert.AreEqual(string.Empty, fullPath);
    }

    [TestMethod]
    public void TryResolveLocalPath_RejectsAReferenceWhenThereIsNoArtRoot()
    {
        Assert.IsFalse(CardArtSourceReference.TryResolveLocalPath("local:card-art/BM-001.webp", null, out _));
        Assert.IsFalse(CardArtSourceReference.TryResolveLocalPath("local:card-art/BM-001.webp", "  ", out _));
    }

    [DataTestMethod]
    [DataRow("BM-001")]
    [DataRow("bm-001")]
    [DataRow("BM_001")]
    [DataRow("BM.001")]
    [DataRow("sasuke")]
    public void IsSafeSegment_AcceptsPlainCardIds(string cardId)
    {
        Assert.IsTrue(CardArtSourceReference.IsSafeSegment(cardId), $"'{cardId}' should be usable as-is.");
    }

    [DataTestMethod]
    [DataRow(null)]
    [DataRow("")]
    [DataRow("   ")]
    [DataRow(".")]
    [DataRow("..")]
    [DataRow("a/b")]
    [DataRow("a\\b")]
    [DataRow("a:b")]
    [DataRow("a b")]
    [DataRow("a?b")]
    public void IsSafeSegment_RejectsAnythingThatNeedsRewriting(string? cardId)
    {
        Assert.IsFalse(CardArtSourceReference.IsSafeSegment(cardId));
    }

    [TestMethod]
    public void IsSafeSegment_RejectsACardIdOverTheColumnLength()
    {
        Assert.IsFalse(CardArtSourceReference.IsSafeSegment(new string('A', 65)));
        Assert.IsTrue(CardArtSourceReference.IsSafeSegment(new string('A', 64)));
    }

    [TestMethod]
    public void SafeSegment_StillRewritesValuesItIsHandedDirectly()
    {
        // Used for cache file names, where rewriting is fine because nothing is looked up by the original.
        Assert.AreEqual("a_b", CardArtSourceReference.SafeSegment("a/b"));
    }
}
