using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;
using ProjectHiddenVillage.Server.Api.Services.CardArt;
using ProjectHiddenVillage.Server.Data;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// The read path for uploaded art, exercised against real directories and a real master file. This is the path
/// every card image in the game goes through, and the rule being pinned here - a request at or above the master
/// cap is served from the master rather than from a derived cache file - is exactly the kind of change that would
/// otherwise only show up as "the 600 preview stopped working" in a browser.
/// </summary>
[TestClass]
public sealed class CardArtServiceTests
{
    private const string CardId = "N-001";
    private const string Version = "1750000000000";
    private const string NextVersion = "1750000600000";

    [TestMethod]
    public async Task ResolveAsync_ServesTheMasterItselfAtTheCapWidth()
    {
        using var fixture = await ArtFixture.CreateAsync();

        var payload = await fixture.Service.ResolveAsync(CardId, 600, Version, CancellationToken.None);

        Assert.IsNotNull(payload);
        var servedBytes = await ReadAsync(payload!);

        CollectionAssert.AreEqual(
            fixture.MasterBytes,
            servedBytes,
            "the cap width should be the stored master byte for byte, with nothing re-encoded");

        Assert.AreEqual("image/webp", payload!.ContentType);
        Assert.IsTrue(payload.ETag.Contains($"|master|{Version}", StringComparison.Ordinal), payload.ETag);
        Assert.IsTrue(payload.IsImmutable, "a request that carries a version is immutable");

        Assert.AreEqual(
            0,
            fixture.CountCacheFiles(),
            "serving the master must not write a variant file - that would be the duplicate again");
    }

    [TestMethod]
    public async Task ResolveAsync_ServesTheMasterForWidthsAboveTheCapToo()
    {
        using var fixture = await ArtFixture.CreateAsync();

        var payload = await fixture.Service.ResolveAsync(CardId, 1200, Version, CancellationToken.None);

        Assert.IsNotNull(payload);
        CollectionAssert.AreEqual(fixture.MasterBytes, await ReadAsync(payload!));
        Assert.AreEqual(0, fixture.CountCacheFiles());
    }

    [TestMethod]
    public async Task ResolveAsync_StillDerivesAndCachesASmallerWidth()
    {
        using var fixture = await ArtFixture.CreateAsync();

        var payload = await fixture.Service.ResolveAsync(CardId, 240, Version, CancellationToken.None);

        Assert.IsNotNull(payload);
        var servedBytes = await ReadAsync(payload!);

        CollectionAssert.AreNotEqual(fixture.MasterBytes, servedBytes);
        Assert.IsTrue(payload!.ETag.Contains($"|240|{Version}", StringComparison.Ordinal), payload.ETag);

        using var decoded = await Image.LoadAsync(new MemoryStream(servedBytes));
        Assert.IsTrue(decoded.Width <= 240, $"a 240 request produced {decoded.Width}px");

        Assert.AreEqual(1, fixture.CountCacheFiles(), "a smaller width is cached, which is what the cache is for");
    }

    [TestMethod]
    public async Task ResolveAsync_GivesEachVersionItsOwnEtag()
    {
        using var fixture = await ArtFixture.CreateAsync();

        var first = await fixture.Service.ResolveAsync(CardId, 600, Version, CancellationToken.None);
        var second = await fixture.Service.ResolveAsync(CardId, 600, NextVersion, CancellationToken.None);

        Assert.IsNotNull(first);
        Assert.IsNotNull(second);
        Assert.AreNotEqual(
            first!.ETag,
            second!.ETag,
            "a re-uploaded master is overwritten in place, so the version is what tells a client the bytes moved");

        await ReadAsync(first);
        await ReadAsync(second);
    }

    [TestMethod]
    public async Task ResolveAsync_ReportsNothingWhenTheMasterIsMissing()
    {
        using var fixture = await ArtFixture.CreateAsync();
        File.Delete(fixture.MasterPath);

        var payload = await fixture.Service.ResolveAsync(CardId, 600, Version, CancellationToken.None);

        Assert.IsNull(payload);
    }

    [TestMethod]
    public async Task ResolveAsync_ReportsNothingWhenTheCardHasNoArt()
    {
        using var fixture = await ArtFixture.CreateAsync(image: string.Empty);

        var payload = await fixture.Service.ResolveAsync(CardId, 240, Version, CancellationToken.None);

        Assert.IsNull(payload);
    }

    [TestMethod]
    public async Task ResolveAsync_ReportsNothingForALocalReferenceThatEscapesTheUploadRoot()
    {
        using var fixture = await ArtFixture.CreateAsync(image: "local:card-art/../../../appsettings.json");

        var payload = await fixture.Service.ResolveAsync(CardId, 240, Version, CancellationToken.None);

        Assert.IsNull(payload);
    }

    private static async Task<byte[]> ReadAsync(CardArtPayload payload)
    {
        using var stream = payload.Stream;
        using var buffer = new MemoryStream();
        await stream.CopyToAsync(buffer);
        return buffer.ToArray();
    }

    private sealed class ArtFixture : IDisposable
    {
        private readonly string root;

        private ArtFixture(string root, ApplicationDbContext dbContext, CardArtService service, string masterPath)
        {
            this.root = root;
            DbContext = dbContext;
            Service = service;
            MasterPath = masterPath;
        }

        public ApplicationDbContext DbContext { get; }

        public CardArtService Service { get; }

        public string MasterPath { get; }

        public byte[] MasterBytes { get; private init; } = [];

        public static async Task<ArtFixture> CreateAsync(string? image = null)
        {
            var root = Path.Combine(Path.GetTempPath(), $"phv-art-tests-{Guid.NewGuid():N}");
            var artRoot = Path.Combine(root, "card-art-uploads");
            var masterPath = CardArtSourceReference.BuildMasterPath(artRoot, CardId);

            Directory.CreateDirectory(Path.GetDirectoryName(masterPath)!);

            var masterBytes = await CardArtImageProcessor.ResizeToWebpAsync(
                await CreatePngBytesAsync(600, 838),
                new CardArtOptions().ResolveMasterWidth(),
                CancellationToken.None);

            await File.WriteAllBytesAsync(masterPath, masterBytes);

            var dbContext = CreateDbContext();
            dbContext.CardCatalogEntries.Add(new CardCatalogEntry
            {
                CardId = CardId,
                Image = image ?? CardArtSourceReference.BuildLocalReference(CardId),
                DisplayName = "Test Card",
                Type = CardType.Character,
                Color = CardColor.Red,
                Description = string.Empty,
                NameJson = "[]",
                TraitsJson = "[]",
                ConditionsJson = "[]",
                EffectsJson = "[]",
                Health = 3,
                CreatedAtUtc = DateTimeOffset.UtcNow.AddDays(-1),
                UpdatedAtUtc = DateTimeOffset.UtcNow.AddDays(-1),
            });
            await dbContext.SaveChangesAsync();

            var options = Options.Create(new CardArtOptions());
            var environment = new TestWebHostEnvironment { ContentRootPath = root };
            var service = new CardArtService(
                dbContext,
                new StubHttpClientFactory(),
                options,
                environment,
                NullLogger<CardArtService>.Instance);

            return new ArtFixture(root, dbContext, service, masterPath) { MasterBytes = masterBytes };
        }

        public int CountCacheFiles()
        {
            var cacheRoot = Path.Combine(root, "card-art-cache");

            return Directory.Exists(cacheRoot)
                ? Directory.EnumerateFiles(cacheRoot).Count()
                : 0;
        }

        public void Dispose()
        {
            DbContext.Dispose();

            if (Directory.Exists(root))
            {
                Directory.Delete(root, recursive: true);
            }
        }

        private static async Task<byte[]> CreatePngBytesAsync(int width, int height)
        {
            using var source = new Image<Rgba32>(width, height);
            source.Mutate(context => context.BackgroundColor(Color.White));
            using var png = new MemoryStream();
            await source.SaveAsPngAsync(png);
            return png.ToArray();
        }

        private static ApplicationDbContext CreateDbContext()
        {
            var options = new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseInMemoryDatabase(databaseName: $"card-art-service-tests-{Guid.NewGuid()}")
                .Options;

            return new ApplicationDbContext(options);
        }
    }

    private sealed class TestWebHostEnvironment : IWebHostEnvironment
    {
        public string ApplicationName { get; set; } = "ProjectHiddenVillage.Server.Tests";

        public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();

        public string WebRootPath { get; set; } = string.Empty;

        public string EnvironmentName { get; set; } = "Test";

        public string ContentRootPath { get; set; } = string.Empty;

        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private sealed class StubHttpClientFactory : IHttpClientFactory
    {
        /// <summary>
        /// Only reached for a remote art source; every test here uses a local master, so an unused client is fine.
        /// </summary>
        public HttpClient CreateClient(string name) => new();
    }
}
