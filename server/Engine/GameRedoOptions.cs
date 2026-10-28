namespace ProjectHiddenVillage.Server.Engine;

/// <summary>
/// How taking a move back behaves. <see cref="Enabled"/> is the kill switch for the whole feature, so a deployment
/// can turn redo off without shipping code, the same way the phase automation and the clock are configured.
/// </summary>
public sealed class GameRedoOptions
{
    public const string SectionName = "GameRedo";

    public bool Enabled { get; set; } = true;

    /// <summary>How long an unanswered redo request holds the table before it is dropped as declined.</summary>
    public int ResponseTimeoutMs { get; set; } = 30_000;

    /// <summary>How many rewind points a game keeps. Each point is a full board snapshot, so this is the depth of a chain.</summary>
    public int MaxRewindPoints { get; set; } = 20;
}
