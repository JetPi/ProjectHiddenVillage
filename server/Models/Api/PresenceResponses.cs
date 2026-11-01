namespace ProjectHiddenVillage.Server;

/// <summary>
/// Everyone looking at the site right now, plus the queue depth per format. The same shape travels over the
/// presence hub and over <c>GET /api/presence</c>, so a client can paint the number before the socket is up and
/// then keep it live without two code paths.
/// </summary>
public sealed record PresenceSnapshot(
    int OnlineViewers,
    IReadOnlyList<WaitingPlayersByRuleset> WaitingByRuleset,
    int AuthenticatedViewers = 0,
    int AnonymousViewers = 0,
    bool MaintenanceEnabled = false,
    string? MaintenanceMessage = null,
    int ActiveGames = 0);
