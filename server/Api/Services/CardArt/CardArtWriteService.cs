using ErrorOr;
using Microsoft.Extensions.Options;
using ProjectHiddenVillage.Server.Api.Interfaces.CardArt;

namespace ProjectHiddenVillage.Server.Api.Services.CardArt;

public sealed class CardArtWriteService : ICardArtWriteService
{
    /// <summary>Fallback master width when no variant widths are configured.</summary>
    private const int DefaultMasterWidth = 600;

    private readonly CardArtOptions options;
    private readonly IWebHostEnvironment environment;
    private readonly ICardArtOrphanSweeper orphanSweeper;
    private readonly ILogger<CardArtWriteService> logger;

    public CardArtWriteService(
        IOptions<CardArtOptions> options,
        IWebHostEnvironment environment,
        ICardArtOrphanSweeper orphanSweeper,
        ILogger<CardArtWriteService> logger)
    {
        this.options = options.Value;
        this.environment = environment;
        this.orphanSweeper = orphanSweeper;
        this.logger = logger;
    }

    public async Task<ErrorOr<CardArtUploadResult>> StoreUploadAsync(
        string cardId,
        Stream content,
        string? contentType,
        CancellationToken cancellationToken)
    {
        if (!CardArtSourceReference.IsSafeSegment(cardId))
        {
            return Error.Validation(
                code: "CardArt.Upload.InvalidCardId",
                description: "Card id must be 1-64 characters of letters, digits, dot, dash or underscore.");
        }

        if (content is null)
        {
            return Error.Validation(
                code: "CardArt.Upload.FileRequired",
                description: "An image file is required.");
        }

        var normalizedContentType = NormalizeContentType(contentType);
        if (!IsAllowedContentType(normalizedContentType))
        {
            return Error.Validation(
                code: "CardArt.Upload.UnsupportedContentType",
                description: $"Image type '{normalizedContentType}' is not supported. Allowed types: {string.Join(", ", options.AllowedUploadContentTypes)}.");
        }

        var rawBytes = await ReadWithLimitAsync(content, options.MaxUploadBytes, cancellationToken);
        if (rawBytes is null)
        {
            return Error.Validation(
                code: "CardArt.Upload.TooLarge",
                description: $"Image exceeds the {options.MaxUploadBytes} byte limit.");
        }

        // Dimensions are read without decoding the pixels, so an oversized image is refused before any full
        // decode is attempted.
        var dimensions = await CardArtImageProcessor.TryIdentifyAsync(rawBytes, cancellationToken);
        if (dimensions is null)
        {
            return Error.Validation(
                code: "CardArt.Upload.InvalidImage",
                description: "The uploaded file could not be read as a PNG, JPEG or WebP image.");
        }

        var pixelCount = (long)dimensions.Value.Width * dimensions.Value.Height;
        if (pixelCount > options.MaxUploadPixels)
        {
            logger.LogWarning(
                "Rejected a {Width}x{Height} card art upload above the {MaxPixels} pixel budget.",
                dimensions.Value.Width,
                dimensions.Value.Height,
                options.MaxUploadPixels);

            return Error.Validation(
                code: "CardArt.Upload.TooManyPixels",
                description: $"Image is {dimensions.Value.Width}x{dimensions.Value.Height}, above the {options.MaxUploadPixels} pixel limit.");
        }

        byte[] masterBytes;
        try
        {
            // Every stored master is re-encoded, so what the read path later decodes is always a validated WebP
            // rather than whatever the author uploaded. The master is capped at the widest servable variant.
            masterBytes = await CardArtImageProcessor.ResizeToWebpAsync(rawBytes, ResolveMasterWidth(), cancellationToken);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogWarning(exception, "Failed to normalise an uploaded card art image.");
            return Error.Validation(
                code: "CardArt.Upload.InvalidImage",
                description: "The uploaded file could not be read as a PNG, JPEG or WebP image.");
        }

        var trimmedCardId = cardId.Trim();
        var safeCardId = CardArtSourceReference.SafeSegment(trimmedCardId);
        var artRoot = ResolveUploadRoot();
        var masterPath = Path.Combine(artRoot, CardArtSourceReference.BuildFileName(trimmedCardId));

        var writeLock = CardArtWriteLocks.ForCard(safeCardId);
        await writeLock.WaitAsync(cancellationToken);
        try
        {
            Directory.CreateDirectory(artRoot);

            var tempPath = masterPath + ".tmp";
            await File.WriteAllBytesAsync(tempPath, masterBytes, cancellationToken);
            File.Move(tempPath, masterPath, overwrite: true);
        }
        catch (IOException exception)
        {
            logger.LogError(exception, "Failed to store card art for '{CardId}'.", trimmedCardId);
            return Error.Failure(
                code: "CardArt.Upload.PersistFailed",
                description: "The uploaded image could not be stored.");
        }
        finally
        {
            writeLock.Release();
        }

        // The cached variants were decoded from the master this upload just replaced, and their file names carry
        // the card's updated timestamp rather than the master's, so they must not survive the replacement.
        DeleteCachedVariants(safeCardId);

        // Writes are the only moment an orphan can appear (an author who uploads and then abandons the form), so
        // this is where the sweep is triggered from. It is rate-limited internally and cannot throw.
        await orphanSweeper.SweepIfDueAsync(cancellationToken);

        return new CardArtUploadResult(
            CardId: trimmedCardId,
            Reference: CardArtSourceReference.BuildLocalReference(trimmedCardId),
            Version: DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
    }

    public async Task<ErrorOr<Deleted>> DeleteUploadAsync(string cardId, CancellationToken cancellationToken)
    {
        if (!CardArtSourceReference.IsSafeSegment(cardId))
        {
            return Error.Validation(
                code: "CardArt.Upload.InvalidCardId",
                description: "Card id must be 1-64 characters of letters, digits, dot, dash or underscore.");
        }

        var trimmedCardId = cardId.Trim();
        var safeCardId = CardArtSourceReference.SafeSegment(trimmedCardId);
        var masterPath = Path.Combine(ResolveUploadRoot(), CardArtSourceReference.BuildFileName(trimmedCardId));

        var writeLock = CardArtWriteLocks.ForCard(safeCardId);
        await writeLock.WaitAsync(cancellationToken);
        try
        {
            if (File.Exists(masterPath))
            {
                File.Delete(masterPath);
            }
        }
        catch (IOException exception)
        {
            logger.LogError(exception, "Failed to delete card art for '{CardId}'.", trimmedCardId);
            return Error.Failure(
                code: "CardArt.Upload.DeleteFailed",
                description: "The stored image could not be removed.");
        }
        finally
        {
            writeLock.Release();
        }

        DeleteCachedVariants(safeCardId);

        await orphanSweeper.SweepIfDueAsync(cancellationToken);

        return Result.Deleted;
    }

    private string ResolveUploadRoot()
    {
        return Path.Combine(environment.ContentRootPath, options.UploadDirectory);
    }

    private int ResolveMasterWidth()
    {
        return options.AllowedWidths.Count > 0 ? options.AllowedWidths.Max() : DefaultMasterWidth;
    }

    private static string NormalizeContentType(string? contentType)
    {
        if (string.IsNullOrWhiteSpace(contentType))
        {
            return string.Empty;
        }

        var trimmed = contentType.Trim();
        var parameterIndex = trimmed.IndexOf(';');

        return (parameterIndex >= 0 ? trimmed[..parameterIndex] : trimmed).Trim();
    }

    private bool IsAllowedContentType(string contentType)
    {
        return options.AllowedUploadContentTypes
            .Exists(allowed => string.Equals(allowed.Trim(), contentType, StringComparison.OrdinalIgnoreCase));
    }

    private void DeleteCachedVariants(string safeCardId)
    {
        if (string.IsNullOrWhiteSpace(options.CacheDirectory))
        {
            return;
        }

        var cacheRoot = Path.Combine(environment.ContentRootPath, options.CacheDirectory);
        if (!Directory.Exists(cacheRoot))
        {
            return;
        }

        try
        {
            foreach (var cachedVariantPath in Directory.EnumerateFiles(cacheRoot, $"{safeCardId}__w*.webp"))
            {
                File.Delete(cachedVariantPath);
            }
        }
        catch (IOException exception)
        {
            // A stale variant only costs one rebuild; it must never fail a write that has already committed.
            logger.LogWarning(exception, "Failed to clear cached art variants for '{CardId}'.", safeCardId);
        }
    }

    private static async Task<byte[]?> ReadWithLimitAsync(
        Stream stream,
        long maxBytes,
        CancellationToken cancellationToken)
    {
        using var buffer = new MemoryStream();
        var chunk = new byte[81920];
        int read;
        while ((read = await stream.ReadAsync(chunk, cancellationToken)) > 0)
        {
            if (buffer.Length + read > maxBytes)
            {
                return null;
            }

            await buffer.WriteAsync(chunk.AsMemory(0, read), cancellationToken);
        }

        return buffer.ToArray();
    }
}
