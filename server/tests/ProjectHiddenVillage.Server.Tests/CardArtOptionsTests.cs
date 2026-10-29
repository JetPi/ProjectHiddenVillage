using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.CardArt;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class CardArtOptionsTests
{
    /// <summary>
    /// Mirrors `CARD_ART_WIDTH_LADDER` in `client/src/services/api/cardArt.ts`.
    ///
    /// The client hands this list to `srcset`, so every step has to be servable. A step the server refuses is not
    /// a visible error: the browser's chosen candidate 400s, the <c>img</c> fires `onError`, and the card drops to
    /// its placeholder - which reads as art that stays blurry no matter how large the screen is.
    /// </summary>
    private static readonly int[] ClientWidthLadder = [120, 240, 360, 600, 900];

    [TestMethod]
    public void AllowedWidths_CoversEveryWidthTheClientAsksFor()
    {
        var options = new CardArtOptions();

        foreach (var width in ClientWidthLadder)
        {
            Assert.IsTrue(
                options.AllowedWidths.Contains(width),
                $"Card art width {width} is requested by the client but refused by the server.");
        }
    }

    [TestMethod]
    public void AllowedWidths_IsAscendingSoTheLargestEntryIsTheMasterCap()
    {
        var options = new CardArtOptions();

        CollectionAssert.AreEqual(
            options.AllowedWidths.OrderBy(width => width).ToList(),
            options.AllowedWidths,
            "The width ladder has to stay ascending: `ResolveMasterWidth` takes the last entry, and `srcset` order is meaningful.");
    }

    [TestMethod]
    public void ResolveMasterWidth_DefaultsToTheWidestWidthTheClientCanAskFor()
    {
        // A master narrower than the widest variant would leave the largest surface permanently upscaled.
        Assert.AreEqual(ClientWidthLadder[^1], new CardArtOptions().ResolveMasterWidth());
    }
}
