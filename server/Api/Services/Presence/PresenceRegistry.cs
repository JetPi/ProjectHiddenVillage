using Microsoft.Extensions.Options;

namespace ProjectHiddenVillage.Server.Api.Services.Presence;

/// <summary>The numbers the snapshot publishes. The split is informational; the total is what the UI shows.</summary>
public sealed record PresenceCounts(int OnlineViewers, int AuthenticatedViewers, int AnonymousViewers);

/// <summary>
/// Who is looking at the site right now. It is keyed on the viewer id the client supplies, never on the token's
/// subject: the development authentication bypass authenticates every anonymous caller as one seeded user, and in
/// production an un-named visitor has no subject at all, so a claim-keyed count would collapse or miss viewers.
///
/// One viewer id holds several connections (its tabs) and counts once. It is a separate registry from
/// <see cref="GamePresenceTracker"/> on purpose: that one answers "who must acknowledge this phase presentation",
/// and folding site-wide viewers into it would mint acknowledgements for players who are not on the board.
/// </summary>
public sealed class PresenceRegistry
{
    private sealed class ViewerEntry
    {
        public HashSet<string> ConnectionIds { get; } = new(StringComparer.Ordinal);

        public bool IsAuthenticated { get; set; }
    }

    private readonly Dictionary<string, ViewerEntry> viewersById = new(StringComparer.Ordinal);
    private readonly Dictionary<string, string> viewerIdByConnectionId = new(StringComparer.Ordinal);
    private readonly object syncRoot = new();
    private readonly int maxConnectionsPerViewer;

    public PresenceRegistry(IOptions<PresenceOptions> options)
    {
        maxConnectionsPerViewer = Math.Max(1, options.Value.MaxConnectionsPerViewer);
    }

    /// <summary>
    /// Registers one connection for a viewer. Returns false when the id is unusable or the viewer is already at
    /// its connection cap, in which case the connection stays open but is not counted.
    /// </summary>
    public bool Register(string viewerId, string connectionId, bool isAuthenticated)
    {
        var normalizedViewerId = NormalizeViewerId(viewerId);
        if (normalizedViewerId is null || string.IsNullOrWhiteSpace(connectionId))
        {
            return false;
        }

        lock (syncRoot)
        {
            if (!viewersById.TryGetValue(normalizedViewerId, out var viewer))
            {
                viewer = new ViewerEntry();
                viewersById[normalizedViewerId] = viewer;
            }

            if (viewer.ConnectionIds.Count >= maxConnectionsPerViewer)
            {
                return false;
            }

            viewer.ConnectionIds.Add(connectionId);
            viewer.IsAuthenticated |= isAuthenticated;
            viewerIdByConnectionId[connectionId] = normalizedViewerId;

            return true;
        }
    }

    /// <summary>Drops one connection; the viewer stops counting only when its last connection goes.</summary>
    public void Remove(string connectionId)
    {
        if (string.IsNullOrWhiteSpace(connectionId))
        {
            return;
        }

        lock (syncRoot)
        {
            if (!viewerIdByConnectionId.Remove(connectionId, out var viewerId))
            {
                return;
            }

            if (!viewersById.TryGetValue(viewerId, out var viewer))
            {
                return;
            }

            viewer.ConnectionIds.Remove(connectionId);

            if (viewer.ConnectionIds.Count == 0)
            {
                viewersById.Remove(viewerId);
            }
        }
    }

    public PresenceCounts GetCounts()
    {
        lock (syncRoot)
        {
            var authenticated = viewersById.Values.Count(viewer => viewer.IsAuthenticated);

            return new PresenceCounts(
                OnlineViewers: viewersById.Count,
                AuthenticatedViewers: authenticated,
                AnonymousViewers: viewersById.Count - authenticated);
        }
    }

    /// <summary>
    /// A viewer id is client-generated, so it is only accepted in a shape a client id can have: bounded length and
    /// no characters that would make the dictionary keys surprising.
    /// </summary>
    private static string? NormalizeViewerId(string viewerId)
    {
        var trimmed = (viewerId ?? string.Empty).Trim();
        if (trimmed.Length is < 8 or > 64)
        {
            return null;
        }

        foreach (var character in trimmed)
        {
            if (!char.IsLetterOrDigit(character) && character != '-')
            {
                return null;
            }
        }

        return trimmed;
    }
}
