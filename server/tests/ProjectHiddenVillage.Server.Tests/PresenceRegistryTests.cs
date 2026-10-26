using Microsoft.Extensions.Options;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.Presence;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class PresenceRegistryTests
{
    [TestMethod]
    public void GetCounts_CountsAViewerWithSeveralTabsOnce()
    {
        var registry = CreateRegistry();

        Assert.IsTrue(registry.Register("viewer-a", "connection-1", isAuthenticated: false));
        Assert.IsTrue(registry.Register("viewer-a", "connection-2", isAuthenticated: false));
        Assert.IsTrue(registry.Register("viewer-b", "connection-3", isAuthenticated: true));

        var counts = registry.GetCounts();

        Assert.AreEqual(2, counts.OnlineViewers);
        Assert.AreEqual(1, counts.AuthenticatedViewers);
        Assert.AreEqual(1, counts.AnonymousViewers);
    }

    [TestMethod]
    public void Remove_DropsAViewerOnlyWhenItsLastConnectionLeaves()
    {
        var registry = CreateRegistry();
        registry.Register("viewer-a", "connection-1", isAuthenticated: false);
        registry.Register("viewer-a", "connection-2", isAuthenticated: false);

        registry.Remove("connection-1");

        Assert.AreEqual(1, registry.GetCounts().OnlineViewers, "A second tab must keep the viewer counted.");

        registry.Remove("connection-2");

        Assert.AreEqual(0, registry.GetCounts().OnlineViewers);

        // Removing a connection twice, or one that was never registered, is a no-op rather than a negative count.
        registry.Remove("connection-2");
        registry.Remove("unknown-connection");

        Assert.AreEqual(0, registry.GetCounts().OnlineViewers);
    }

    [TestMethod]
    public void Register_EnforcesThePerViewerConnectionCap()
    {
        var registry = CreateRegistry(maxConnectionsPerViewer: 2);

        Assert.IsTrue(registry.Register("viewer-a", "connection-1", isAuthenticated: false));
        Assert.IsTrue(registry.Register("viewer-a", "connection-2", isAuthenticated: false));
        Assert.IsFalse(registry.Register("viewer-a", "connection-3", isAuthenticated: false));

        Assert.AreEqual(1, registry.GetCounts().OnlineViewers);
    }

    [TestMethod]
    public void Register_RejectsUnusableViewerIds()
    {
        var registry = CreateRegistry();

        Assert.IsFalse(registry.Register(string.Empty, "connection-1", isAuthenticated: false));
        Assert.IsFalse(registry.Register("short", "connection-2", isAuthenticated: false));
        Assert.IsFalse(registry.Register(new string('a', 65), "connection-3", isAuthenticated: false));
        Assert.IsFalse(registry.Register("not a viewer id", "connection-4", isAuthenticated: false));

        Assert.AreEqual(0, registry.GetCounts().OnlineViewers);
    }

    private static PresenceRegistry CreateRegistry(int maxConnectionsPerViewer = 5)
    {
        return new PresenceRegistry(Options.Create(new PresenceOptions
        {
            MaxConnectionsPerViewer = maxConnectionsPerViewer,
        }));
    }
}
