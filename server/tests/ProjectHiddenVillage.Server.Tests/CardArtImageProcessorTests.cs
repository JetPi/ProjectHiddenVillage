using System.Text;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;
using ProjectHiddenVillage.Server.Api.Services.CardArt;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class CardArtImageProcessorTests
{
    [TestMethod]
    public async Task ResizeToWebpAsync_DownscalesToRequestedWidth()
    {
        var sourceBytes = await CreatePngBytesAsync(400, 558);

        var result = await CardArtImageProcessor.ResizeToWebpAsync(sourceBytes, 240, CancellationToken.None);

        AssertWebp(result);
        using var decoded = await Image.LoadAsync(new MemoryStream(result));
        Assert.IsTrue(decoded.Width > 0 && decoded.Width <= 240);
    }

    [TestMethod]
    public async Task ResizeToWebpAsync_DoesNotUpscaleSmallerSources()
    {
        var sourceBytes = await CreatePngBytesAsync(100, 140);

        var result = await CardArtImageProcessor.ResizeToWebpAsync(sourceBytes, 240, CancellationToken.None);

        AssertWebp(result);
        using var decoded = await Image.LoadAsync(new MemoryStream(result));
        Assert.IsTrue(decoded.Width > 0 && decoded.Width <= 100);
    }

    private static async Task<byte[]> CreatePngBytesAsync(int width, int height)
    {
        using var source = new Image<Rgba32>(width, height);
        source.Mutate(context => context.BackgroundColor(Color.White));
        using var png = new MemoryStream();
        await source.SaveAsPngAsync(png);
        return png.ToArray();
    }

    private static void AssertWebp(byte[] bytes)
    {
        Assert.IsNotNull(bytes);
        Assert.IsTrue(bytes.Length > 12, "Encoded output should start with a WebP container header.");
        Assert.AreEqual("RIFF", Encoding.ASCII.GetString(bytes, 0, 4));
        Assert.AreEqual("WEBP", Encoding.ASCII.GetString(bytes, 8, 4));
    }
}
