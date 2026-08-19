namespace ProjectHiddenVillage.Server;

public sealed class EffectResolutionStackEntry
{
    public string EntryId { get; set; } = Guid.NewGuid().ToString("N");

    public string SourcePlayerId { get; set; } = string.Empty;

    public PlayerZone SourceZone { get; set; }

    public string SourceCardInstanceId { get; set; } = string.Empty;

    public string EffectTypeKey { get; set; } = string.Empty;

    public List<GameEffectTargetReference> SelectedTargets { get; set; } = [];

    public Dictionary<string, string> Arguments { get; set; } = new(StringComparer.Ordinal);

    public bool IsNegated { get; set; }
}