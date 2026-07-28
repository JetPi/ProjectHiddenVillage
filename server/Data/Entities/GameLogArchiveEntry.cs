namespace ProjectHiddenVillage.Server.Data.Entities;

public sealed class GameLogArchiveEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string GameId { get; set; } = string.Empty;

    public DateTimeOffset CompletedAtUtc { get; set; } = DateTimeOffset.UtcNow;

    public string PayloadJson { get; set; } = "{}";
}
