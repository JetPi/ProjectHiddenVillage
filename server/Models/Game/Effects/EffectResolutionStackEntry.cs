namespace ProjectHiddenVillage.Server;

public sealed class EffectResolutionStackEntry
{
    public string EntryId { get; set; } = Guid.NewGuid().ToString("N");

    public string SourcePlayerId { get; set; } = string.Empty;

    public PlayerZone SourceZone { get; set; }

    public string SourceCardInstanceId { get; set; } = string.Empty;

    public string EffectTypeKey { get; set; } = string.Empty;

    /// <summary>
    /// Set for a support activation: the id of the effect inside the source card's definition that the
    /// activation is rooted at. The engine replays the whole activation chain when the window closes,
    /// while <see cref="EffectTypeKey"/> alone describes a single passive consequence.
    /// </summary>
    public string ActivatedEffectId { get; set; } = string.Empty;

    public List<GameEffectTargetReference> SelectedTargets { get; set; } = [];

    public Dictionary<string, string> Arguments { get; set; } = new(StringComparer.Ordinal);

    public bool IsNegated { get; set; }
}