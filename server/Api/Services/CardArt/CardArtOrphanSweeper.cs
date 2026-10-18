using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ProjectHiddenVillage.Server.Api.Interfaces.CardArt;
using ProjectHiddenVillage.Server.Data;

namespace ProjectHiddenVillage.Server.Api.Services.CardArt;

public sealed class CardArtOrphanSweeper : ICardArtOrphanSweeper
{
    /// <summary>
    /// When the last sweep ran, in UTC ticks. Static because the service is scoped: a per-request field would
    /// sweep on every single write.
    /// </summary>
    private static long lastSweepUtcTicks;

    private readonly ApplicationDbContext dbContext;
    private readonly CardArtOptions options;
    private readonly IWebHostEnvironment environment;
    private readonly ILogger<CardArtOrphanSweeper> logger;

    public CardArtOrphanSweeper(
        ApplicationDbContext dbContext,
        IOptions<CardArtOptions> options,
        IWebHostEnvironment environment,
        ILogger<CardArtOrphanSweeper> logger)
    {
        this.dbContext = dbContext;
        this.options = options.Value;
        this.environment = environment;
        this.logger = logger;
    }

    public async Task SweepIfDueAsync(CancellationToken cancellationToken)
    {
        if (!options.OrphanSweepEnabled)
        {
            return;
        }

        var now = DateTimeOffset.UtcNow;
        if (!TryClaimSweep(now))
        {
            return;
        }

        try
        {
            var grace = TimeSpan.FromMinutes(Math.Max(0, options.OrphanGraceMinutes));

            CollectOrphanedMasters(await LoadReferencedImagesAsync(cancellationToken), now, grace);
            CollectStaleVariants(await LoadCardVersionsAsync(cancellationToken), now, grace);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            // Housekeeping must never take a write down with it: an uncollected file only costs disk.
            logger.LogWarning(exception, "Card art orphan sweep failed.");
        }
    }

    private bool TryClaimSweep(DateTimeOffset now)
    {
        var interval = TimeSpan.FromMinutes(Math.Max(1, options.OrphanSweepIntervalMinutes));
        var lastTicks = Interlocked.Read(ref lastSweepUtcTicks);

        if (lastTicks != 0 && now.UtcTicks - lastTicks < interval.Ticks)
        {
            return false;
        }

        // Only the caller that moves the timestamp sweeps; the loser of the race lets the winner do the work.
        return Interlocked.CompareExchange(ref lastSweepUtcTicks, now.UtcTicks, lastTicks) == lastTicks;
    }

    private async Task<HashSet<string>> LoadReferencedImagesAsync(CancellationToken cancellationToken)
    {
        var images = await dbContext.CardCatalogEntries
            .AsNoTracking()
            .Select(entry => entry.Image)
            .ToListAsync(cancellationToken);

        return new HashSet<string>(
            images.Where(image => !string.IsNullOrWhiteSpace(image)).Select(image => image.Trim()),
            StringComparer.OrdinalIgnoreCase);
    }

    /// <summary>
    /// The version each card currently serves, encoded exactly the way a variant's file name encodes it (the
    /// card's updated timestamp in milliseconds), so the two can be compared as strings-to-numbers.
    /// </summary>
    private async Task<Dictionary<string, string>> LoadCardVersionsAsync(CancellationToken cancellationToken)
    {
        var cards = await dbContext.CardCatalogEntries
            .AsNoTracking()
            .Select(entry => new { entry.CardId, entry.UpdatedAtUtc })
            .ToListAsync(cancellationToken);

        var versionsByCardId = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var card in cards)
        {
            versionsByCardId[card.CardId] = card.UpdatedAtUtc
                .ToUnixTimeMilliseconds()
                .ToString(CultureInfo.InvariantCulture);
        }

        return versionsByCardId;
    }

    private void CollectOrphanedMasters(
        IReadOnlySet<string> referencedImages,
        DateTimeOffset now,
        TimeSpan grace)
    {
        var uploadRoot = Path.Combine(
            environment.ContentRootPath,
            options.UploadDirectory,
            CardArtSourceReference.LocalFolder);

        if (!Directory.Exists(uploadRoot))
        {
            return;
        }

        foreach (var masterPath in Directory.EnumerateFiles(uploadRoot, $"*{CardArtSourceReference.MasterExtension}"))
        {
            var fileName = Path.GetFileName(masterPath);
            if (!CardArtSourceReference.TryGetMasterCardId(fileName, out var cardId))
            {
                continue;
            }

            var reference = CardArtSourceReference.BuildLocalReferenceFromFileName(fileName);
            if (!CardArtOrphanPolicy.IsCollectableMaster(
                    reference,
                    referencedImages,
                    ReadLastWriteUtc(masterPath),
                    now,
                    grace))
            {
                continue;
            }

            logger.LogInformation(
                "Collecting orphaned card art master '{FileName}': no card references it.",
                fileName);

            DeleteFile(masterPath);
            DeleteCachedVariants(cardId);
        }
    }

    private void CollectStaleVariants(
        IReadOnlyDictionary<string, string> versionsByCardId,
        DateTimeOffset now,
        TimeSpan grace)
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

        foreach (var variantPath in Directory.EnumerateFiles(cacheRoot, $"*{CardArtSourceReference.MasterExtension}"))
        {
            var fileName = Path.GetFileName(variantPath);
            if (!CardArtSourceReference.TryParseVariantFileName(fileName, out var cardId, out _, out var version))
            {
                continue;
            }

            if (!CardArtOrphanPolicy.IsCollectableVariant(
                    cardId,
                    versionsByCardId,
                    version,
                    ReadLastWriteUtc(variantPath),
                    now,
                    grace))
            {
                continue;
            }

            DeleteFile(variantPath);
        }
    }

    private void DeleteCachedVariants(string cardId)
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

        foreach (var variantPath in Directory.EnumerateFiles(
                     cacheRoot,
                     $"{CardArtSourceReference.SafeSegment(cardId)}{CardArtSourceReference.WidthSeparator}*{CardArtSourceReference.MasterExtension}"))
        {
            DeleteFile(variantPath);
        }
    }

    private void DeleteFile(string path)
    {
        try
        {
            File.Delete(path);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            logger.LogWarning(exception, "Failed to collect '{Path}'.", path);
        }
    }

    private static DateTimeOffset ReadLastWriteUtc(string path)
    {
        return new DateTimeOffset(File.GetLastWriteTimeUtc(path), TimeSpan.Zero);
    }
}
