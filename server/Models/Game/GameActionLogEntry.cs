namespace ProjectHiddenVillage.Server;

public sealed class GameActionLogEntry
{
    public string EntryId { get; init; } = Guid.NewGuid().ToString("N");

    public DateTimeOffset TimestampUtc { get; init; } = DateTimeOffset.UtcNow;

    public string ActionType { get; init; } = string.Empty;

    public string Message { get; init; } = string.Empty;

    public string PlayerId { get; init; } = string.Empty;

    public Dictionary<string, string> Metadata { get; init; } = [];
}