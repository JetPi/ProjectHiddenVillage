namespace ProjectHiddenVillage.Server;

public sealed class GameActionLogEntry
{
    public string EntryId { get; init; } = Guid.NewGuid().ToString("N");

    public DateTimeOffset TimestampUtc { get; init; } = DateTimeOffset.UtcNow;

    public string ActionType { get; init; } = string.Empty;

    public string Message { get; init; } = string.Empty;

    public string PlayerId { get; init; } = string.Empty;

    public Dictionary<string, string> Metadata { get; init; } = [];

    /// <summary>
    /// What kind of thing this entry describes. The client groups the published log by it; it never decides
    /// publication on its own (see <see cref="GameActionLogPublishing"/>).
    /// </summary>
    public GameActionLogCategory Category { get; init; } = GameActionLogCategory.Lifecycle;

    /// <summary>
    /// Who may read this entry once it is published. Defaults to <see cref="GameActionLogVisibility.Public"/>
    /// because most of what the engine records is a board change both players watched happen; an entry that
    /// mentions a card the opponent cannot see has to opt into <see cref="GameActionLogVisibility.OwnerOnly"/>.
    /// </summary>
    public GameActionLogVisibility Visibility { get; init; } = GameActionLogVisibility.Public;
}