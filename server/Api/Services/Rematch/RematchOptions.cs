namespace ProjectHiddenVillage.Server.Api.Services.Rematch;

/// <summary>
/// How long a rematch stays offerable, and how long a reserved table waits for its players to come back with a deck.
/// Both windows are time, not board state, so they are configuration like the redo timeout and the clock policy.
/// </summary>
public sealed class RematchOptions
{
    public const string SectionName = "Rematch";

    /// <summary>Kill switch, so a deployment can stop offering rematches without shipping code.</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>How long an unanswered offer holds the finished board before it lapses.</summary>
    public int ConsentLifetimeSeconds { get; set; } = 120;

    /// <summary>
    /// How long the reserved table survives waiting to be claimed. This is the deck-change window: a player who
    /// opens their deck list, rebuilds a card or two and comes back still has a table to join.
    /// </summary>
    public int ReservationLifetimeSeconds { get; set; } = 900;
}
