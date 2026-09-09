using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.Processing;

namespace ProjectHiddenVillage.Server.Api.Services.CardArt;

public static class CardArtImageProcessor
{
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
}
