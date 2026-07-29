namespace ProjectHiddenVillage.Server;

public sealed class EffectSpec
{
    public string Id { get; set; } = string.Empty;

    public EffectKind Kind { get; set; } = EffectKind.Unknown;

    public EffectTiming Timing { get; set; } = EffectTiming.Unspecified;

    public Dictionary<string, string> Args { get; set; } = [];
}