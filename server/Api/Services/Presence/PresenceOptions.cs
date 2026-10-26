namespace ProjectHiddenVillage.Server.Api.Services.Presence;

public sealed class PresenceOptions
{
    public const string SectionName = "Presence";

    /// <summary>
    /// How often the viewer count is recomputed and pushed. Viewers arrive and leave one at a time, so anything
    /// faster would broadcast a change per tab; this coalesces a burst into a single message.
    /// </summary>
    public int BroadcastIntervalSeconds { get; set; } = 2;

    /// <summary>
    /// Connections one viewer id may hold. A viewer with several tabs is counted once, so this only has to be
    /// generous enough for a few tabs while still stopping one client from inflating the number at will.
    /// </summary>
    public int MaxConnectionsPerViewer { get; set; } = 5;
}
