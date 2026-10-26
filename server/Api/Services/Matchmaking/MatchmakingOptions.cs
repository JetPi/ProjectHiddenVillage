namespace ProjectHiddenVillage.Server.Api.Services.Matchmaking;

public sealed class MatchmakingOptions
{
    public const string SectionName = "Matchmaking";

    /// <summary>
    /// How long a waiting ticket survives. It bounds the damage of an abandoned tab: the ticket stops being
    /// matchable after this, and the player simply queues again.
    /// </summary>
    public int TicketLifetimeSeconds { get; set; } = 120;

    /// <summary>
    /// How long a finished ticket (matched, cancelled or expired) is kept around so a polling client can still
    /// read the outcome. After this it is dropped and the client sees "not found", which it treats as expired.
    /// </summary>
    public int FinishedTicketRetentionSeconds { get; set; } = 120;
}
