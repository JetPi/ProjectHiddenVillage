using System.Collections.Concurrent;
using System.Globalization;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ProjectHiddenVillage.Server.Api.Interfaces.CardArt;
using ProjectHiddenVillage.Server.Data;

namespace ProjectHiddenVillage.Server.Api.Services.CardArt;

public sealed partial class CardArtService : ICardArtService
{
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> WriteLocks = new();

    private readonly ApplicationDbContext dbContext;
    private readonly IHttpClientFactory httpClientFactory;
    private readonly CardArtOptions options;
    private readonly IWebHostEnvironment environment;
    private readonly ILogger<CardArtService> logger;

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

        if (!TryParseSourceUrl(source.Image, out var sourceUrl))
        {
            logger.LogWarning("Card '{CardId}' has an unsupported art source URL.", trimmedCardId);
            return null;
        }

        var effectiveVersion = string.IsNullOrWhiteSpace(version)
            ? source.UpdatedAtUtc.ToUnixTimeMilliseconds().ToString(CultureInfo.InvariantCulture)
            : version!;

        var safeVersion = SafeSegment(effectiveVersion);
        var safeCardId = SafeSegment(trimmedCardId);
        var cacheFilePath = Path.Combine(
            environment.ContentRootPath,
            options.CacheDirectory,
            $"{safeCardId}__w{width}__v{safeVersion}.webp");

        var lockKey = $"{safeCardId}|{width}|{safeVersion}";
        var writeLock = WriteLocks.GetOrAdd(lockKey, static _ => new SemaphoreSlim(1, 1));

        await writeLock.WaitAsync(cancellationToken);
        try
        {
            if (!File.Exists(cacheFilePath))
            {
                var generated = await GenerateVariantAsync(sourceUrl, width, cacheFilePath, cancellationToken);
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
            ETag = $"\"{lockKey}\"",
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

        byte[] webpBytes;
        try
        {
            webpBytes = await CardArtImageProcessor.ResizeToWebpAsync(rawBytes, width, cancellationToken);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogWarning(exception, "Failed to decode/resize art source '{Url}'.", sourceUrl);
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

    private static string SafeSegment(string value)
    {
        return InvalidPathSegmentChars().Replace(value, "_");
    }

    [GeneratedRegex(@"[^a-zA-Z0-9._-]", RegexOptions.CultureInvariant)]
    private static partial Regex InvalidPathSegmentChars();
}
