using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Data.Seeding;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class CatalogManifestResolutionTests
{
    private const string EmptyManifest = """{"catalogEntries":[]}""";

    [TestMethod]
    public void ResolveManifestPath_FindsTheRepositoryLayout()
    {
        var root = CreateTempRoot();

        try
        {
            var contentRoot = Path.Combine(root, "server");
            var manifestPath = WriteManifest(Path.Combine(root, "test-data"));

            Assert.AreEqual(manifestPath, CatalogManifest.ResolveManifestPath(contentRoot));
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [TestMethod]
    public void ResolveManifestPath_FindsThePublishedLayout()
    {
        var root = CreateTempRoot();

        try
        {
            var contentRoot = Path.Combine(root, "app");
            var manifestPath = WriteManifest(Path.Combine(contentRoot, "test-data"));

            Assert.AreEqual(manifestPath, CatalogManifest.ResolveManifestPath(contentRoot));
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [TestMethod]
    public void ResolveManifestPath_ThrowsWhenNeitherLayoutHasTheFile()
    {
        var root = CreateTempRoot();

        try
        {
            var contentRoot = Path.Combine(root, "app");
            Directory.CreateDirectory(contentRoot);

            var exception = Assert.ThrowsException<InvalidOperationException>(
                () => CatalogManifest.ResolveManifestPath(contentRoot));

            StringAssert.Contains(exception.Message, "seed-profiles.json");
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [TestMethod]
    public void LoadCatalogEntries_ReadsThePublishedLayout()
    {
        var root = CreateTempRoot();

        try
        {
            var contentRoot = Path.Combine(root, "app");
            WriteManifest(Path.Combine(contentRoot, "test-data"));

            var entries = CatalogManifest.LoadCatalogEntries(contentRoot);

            Assert.AreEqual(0, entries.Count);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    private static string CreateTempRoot()
    {
        var root = Path.Combine(Path.GetTempPath(), $"phv-manifest-resolution-tests-{Guid.NewGuid()}");
        Directory.CreateDirectory(root);
        return root;
    }

    private static string WriteManifest(string directory)
    {
        Directory.CreateDirectory(directory);

        var manifestPath = Path.Combine(directory, "seed-profiles.json");
        File.WriteAllText(manifestPath, EmptyManifest);

        return Path.GetFullPath(manifestPath);
    }
}
