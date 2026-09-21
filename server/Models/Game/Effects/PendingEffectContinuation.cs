namespace ProjectHiddenVillage.Server;

/// <summary>
/// An effect chain that suspended to ask the player for a selection, plus everything needed to rebuild its
/// context and carry on from the node that asked. Stored on the <see cref="GamePrompt"/> that owns the
/// question, so resolving (or discarding) the prompt discards the continuation with it.
/// </summary>
public sealed class PendingEffectContinuation
{
    /// <summary>The prompt this continuation is waiting on.</summary>
    public string PromptId { get; set; } = string.Empty;

    /// <summary>Node to re-enter once the player answered.</summary>
    public string ResumeNodeId { get; set; } = string.Empty;

    public string ActingPlayerId { get; set; } = string.Empty;

    public string SourceCardDefinitionId { get; set; } = string.Empty;

    public string? SourceCardInstanceId { get; set; }

    /// <summary>
    /// Shared step arguments as they were when the chain suspended, so the resumed node keeps paying the
    /// same activation cost and can still read values an earlier step published.
    /// </summary>
    public Dictionary<string, string> Arguments { get; set; } = new(StringComparer.Ordinal);

    /// <summary>Targets the suspended node had already been given (usually none for a prompted node).</summary>
    public List<GameEffectTargetReference> SelectedTargets { get; set; } = [];
}
