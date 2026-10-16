using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ProjectHiddenVillage.Server.Api.Interfaces.CardArt;
using ProjectHiddenVillage.Server.Data;

namespace ProjectHiddenVillage.Server.Api.Services.CardArt;

public sealed class CardArtService : ICardArtService
{
    private readonly ApplicationDbContext dbContext;
    private readonly IHttpClientFactory httpClientFactory;
    private readonly CardArtOptions options;
    private readonly IWebHostEnvironment environment;
    private readonly ILogger<CardArtService> logger;

    /// <summary>
    /// A stored master is server-owned, but this read still caps it: a config change between the write and this
    /// read must not let an unbounded file into memory.
    /// </summary>
    private long LocalMasterByteLimit => Math.Max(options.MaxSourceBytes, options.MaxUploadBytes);

    public CardArtService(
        ApplicationDbContext dbContext,
        IHttpClientFactory httpClientFactory,
        IOptions<CardArtOptions> options,
        IWebHostEnvironment environment,
        ILogger<CardArtService> logger)
    {
        this.dbContext = dbContext;
        this.httpClientFactory = httpClientFactory;
        this.options = options.Value;
        this.environment = environment;
        this.logger = logger;
    }

    public async Task<CardArtPayload?> ResolveAsync(
        string cardId,
        int width,
        string? version,
        CancellationToken cancellationToken)
    {
        var trimmedCardId = cardId?.Trim();
        if (string.IsNullOrWhiteSpace(trimmedCardId))
        {
            return null;
        }

        var normalizedCardId = trimmedCardId.ToUpperInvariant();

        var source = await dbContext.CardCatalogEntries
            .AsNoTracking()
            .Where(entry => entry.CardId.ToUpper() == normalizedCardId)
            .Select(entry => new { entry.Image, entry.UpdatedAtUtc })
            .FirstOrDefaultAsync(cancellationToken);

        if (source is null || string.IsNullOrWhiteSpace(source.Image))
        {
            return null;
        }

        // The stored reference decides where the master comes from: a local: reference names art this server
        // already owns, anything else has to be a fetchable URL on an allowlisted host.
        string? localMasterPath = null;
        Uri? sourceUrl = null;
        var serveMasterDirectly = false;

        if (CardArtSourceReference.IsLocal(source.Image))
        {
            if (!CardArtSourceReference.TryResolveLocalPath(
                    source.Image,
                    Path.Combine(environment.ContentRootPath, options.UploadDirectory),
                    out var resolvedMasterPath))
            {
                logger.LogWarning(
                    "Card '{CardId}' has a local art reference that does not resolve inside the upload root.",
                    trimmedCardId);
                return null;
            }

            localMasterPath = resolvedMasterPath;

            // A master is already stored at the widest width we can serve, so a request at or above that width has
            // nothing to derive: the master *is* the variant, minus a re-encode that cost a second file and a
            // second lossy pass. A master narrower than the cap behaves the same way through the variant path
            // (which refuses to upscale), so this is safe for small uploads too.
            serveMasterDirectly = width >= options.ResolveMasterWidth();
        }
        else if (!TryParseSourceUrl(source.Image, out sourceUrl))
        {
            logger.LogWarning("Card '{CardId}' has an unsupported art source URL.", trimmedCardId);
            return null;
        }

        var effectiveVersion = string.IsNullOrWhiteSpace(version)
            ? source.UpdatedAtUtc.ToUnixTimeMilliseconds().ToString(CultureInfo.InvariantCulture)
            : version!;

        var safeCardId = CardArtSourceReference.SafeSegment(trimmedCardId);

        if (serveMasterDirectly)
        {
            if (localMasterPath is null || !File.Exists(localMasterPath))
            {
                logger.LogWarning("Card '{CardId}' references art whose master is missing.", trimmedCardId);
                return null;
            }

            // No variant lock: nothing is written. A re-upload replaces the directory entry while this stream
            // holds the previous one, so the reader still finishes with a whole image.
            return new CardArtPayload
            {
                Stream = new FileStream(localMasterPath, FileMode.Open, FileAccess.Read, FileShare.Read),
                ContentType = "image/webp",

                // A master is overwritten in place, so its identity has to come from the version rather than from
                // its path - that is what tells a client the bytes changed.
                ETag = $"\"{safeCardId}|master|{CardArtSourceReference.SafeSegment(effectiveVersion)}\"",
                IsImmutable = !string.IsNullOrWhiteSpace(version),
            };
        }

        var safeVersion = CardArtSourceReference.SafeSegment(effectiveVersion);
        var cacheFilePath = Path.Combine(
            environment.ContentRootPath,
            options.CacheDirectory,
            $"{safeCardId}__w{width}__v{safeVersion}.webp");

        // Still the identity of one variant, which is what the ETag has to describe: the lock below is coarser
        // than this key on purpose.
        var variantKey = $"{safeCardId}|{width}|{safeVersion}";

        // One writer per card: the variant cache and the uploaded master are both keyed by the card id, so a
        // build racing an upload would cache a variant decoded from the previous master.
        var writeLock = CardArtWriteLocks.ForCard(safeCardId);

        await writeLock.WaitAsync(cancellationToken);
        try
        {
            if (!File.Exists(cacheFilePath))
            {
                var generated = localMasterPath is not null
                    ? await GenerateVariantFromLocalAsync(localMasterPath, width, cacheFilePath, cancellationToken)
                    : await GenerateVariantAsync(sourceUrl!, width, cacheFilePath, cancellationToken);

                if (!generated)
                {
                    return null;
                }
            }
        }
        finally
        {
            writeLock.Release();
        }

        var payloadStream = new FileStream(cacheFilePath, FileMode.Open, FileAccess.Read, FileShare.Read);
        return new CardArtPayload
        {
            Stream = payloadStream,
            ContentType = "image/webp",
            ETag = $"\"{variantKey}\"",
            IsImmutable = !string.IsNullOrWhiteSpace(version),
        };
    }

    private async Task<bool> GenerateVariantAsync(
        Uri sourceUrl,
        int width,
        string cacheFilePath,
        CancellationToken cancellationToken)
    {
        var client = httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(Math.Max(1, options.SourceTimeoutSeconds));

        byte[] rawBytes;
        try
        {
            using var response = await client.GetAsync(sourceUrl, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("Art source '{Url}' returned {Status}.", sourceUrl, (int)response.StatusCode);
                return false;
            }

            await using var sourceStream = await response.Content.ReadAsStreamAsync(cancellationToken);
            var limited = await ReadWithLimitAsync(sourceStream, options.MaxSourceBytes, cancellationToken);
            if (limited is null)
            {
                logger.LogWarning("Art source '{Url}' exceeded the {MaxBytes} byte limit.", sourceUrl, options.MaxSourceBytes);
                return false;
            }

            rawBytes = limited;
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException or IOException)
        {
            logger.LogWarning(exception, "Failed to fetch art source '{Url}'.", sourceUrl);
            return false;
        }

        return await WriteVariantAsync(rawBytes, width, cacheFilePath, sourceUrl.ToString(), cancellationToken);
    }

    /// <summary>
    /// Builds a variant from a master this server owns. The bytes go through the same image processor as the
    /// remote path, so a master that was replaced on disk cannot ship as art without being decodable.
    /// </summary>
    private async Task<bool> GenerateVariantFromLocalAsync(
        string localMasterPath,
        int width,
        string cacheFilePath,
        CancellationToken cancellationToken)
    {
        byte[] rawBytes;
        try
        {
            await using var masterStream = new FileStream(
                localMasterPath,
                FileMode.Open,
                FileAccess.Read,
                FileShare.Read);

            var limited = await ReadWithLimitAsync(masterStream, LocalMasterByteLimit, cancellationToken);
            if (limited is null)
            {
                logger.LogWarning(
                    "Local art master '{Path}' exceeded the {MaxBytes} byte limit.",
                    localMasterPath,
                    LocalMasterByteLimit);
                return false;
            }

            rawBytes = limited;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            logger.LogWarning(exception, "Failed to read local art master '{Path}'.", localMasterPath);
            return false;
        }

        return await WriteVariantAsync(rawBytes, width, cacheFilePath, localMasterPath, cancellationToken);
    }

    private async Task<bool> WriteVariantAsync(
        byte[] rawBytes,
        int width,
        string cacheFilePath,
        string sourceLabel,
        CancellationToken cancellationToken)
    {
        byte[] webpBytes;
        try
        {
            webpBytes = await CardArtImageProcessor.ResizeToWebpAsync(rawBytes, width, cancellationToken);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogWarning(exception, "Failed to decode/resize art source '{Url}'.", sourceLabel);
            return false;
        }

        var directory = Path.GetDirectoryName(cacheFilePath);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }

        var tempPath = cacheFilePath + ".tmp";
        await File.WriteAllBytesAsync(tempPath, webpBytes, cancellationToken);
        File.Move(tempPath, cacheFilePath, overwrite: true);
        return true;
    }

    private bool TryParseSourceUrl(string rawUrl, out Uri sourceUrl)
    {
        if (!Uri.TryCreate(rawUrl, UriKind.Absolute, out var parsed)
            || (parsed.Scheme != Uri.UriSchemeHttp && parsed.Scheme != Uri.UriSchemeHttps)
            || string.IsNullOrWhiteSpace(parsed.Host))
        {
            sourceUrl = null!;
            return false;
        }

        if (options.SourceHostAllowlist.Count > 0
            && !options.SourceHostAllowlist.Contains(parsed.Host, StringComparer.OrdinalIgnoreCase))
        {
            sourceUrl = null!;
            return false;
        }

        sourceUrl = parsed;
        return true;
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
