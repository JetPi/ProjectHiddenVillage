using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.Processing;

namespace ProjectHiddenVillage.Server.Api.Services.CardArt;

public static class CardArtImageProcessor
{
    /// <summary>
    /// Reads an image's dimensions without decoding its pixels, so a caller can refuse an upload on its pixel
    /// budget before any full decode allocates. Returns null when the bytes are not a supported image.
    /// </summary>
    public static async Task<ImageDimensions?> TryIdentifyAsync(
        byte[] sourceBytes,
        CancellationToken cancellationToken)
    {
        try
        {
            await using var input = new MemoryStream(sourceBytes);
            var info = await Image.IdentifyAsync(input, cancellationToken);

            return new ImageDimensions(info.Width, info.Height);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            return null;
        }
    }

    public static async Task<byte[]> ResizeToWebpAsync(
        byte[] sourceBytes,
        int requestedWidth,
        CancellationToken cancellationToken)
    {
        await using var input = new MemoryStream(sourceBytes);
        using var image = await Image.LoadAsync(input, cancellationToken);

        image.Mutate(context => context.AutoOrient());

        var width = Math.Clamp(requestedWidth, 1, image.Width);
        var height = Math.Max(1, (int)Math.Round(image.Height * (width / (double)image.Width)));

        if (width < image.Width)
        {
            image.Mutate(context =>
            {
                context.Resize(new ResizeOptions
                {
                    Size = new Size(width, height),
                    Mode = ResizeMode.Max,
                    Sampler = KnownResamplers.Lanczos3,
                });
            });
        }

        await using var output = new MemoryStream();
        await image.SaveAsync(output, new WebpEncoder { Quality = 85 });
        return output.ToArray();
    }

    public readonly record struct ImageDimensions(int Width, int Height);
}
