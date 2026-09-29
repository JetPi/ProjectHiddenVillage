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

    /// <summary>
    /// Set when the chain suspended to present a "Reveal First" reveal instead of to ask a question: the cards
    /// stay face up until the player acknowledges, and are turned back down once the resumed chain finishes.
    /// </summary>
    public PendingRevealPresentation? RevealPresentation { get; set; }
}

/// <summary>
/// Cards a "Reveal First" step turned face up for the acting player. A reveal is transient: the chain that
/// made it turns the cards back down when it finishes, unless the card left the zone it was revealed in - a
/// card that moved on (summoned, discarded, placed) cleared its own reveal on the way.
/// </summary>
public sealed class PendingRevealPresentation
{
    /// <summary>Cards that are face up to both players, in the order they were revealed.</summary>
    public List<GameEffectTargetReference> PresentedTargets { get; set; } = [];

    public void Add(IReadOnlyList<GameEffectTargetReference> targets)
    {
        foreach (var target in targets)
        {
            var isAlreadyPresented = PresentedTargets.Any(presented =>
                string.Equals(presented.PlayerId, target.PlayerId, StringComparison.Ordinal)
                && presented.Zone == target.Zone
                && string.Equals(presented.CardInstanceId, target.CardInstanceId, StringComparison.Ordinal));

            if (!isAlreadyPresented)
            {
                PresentedTargets.Add(target);
            }
        }
    }
}
