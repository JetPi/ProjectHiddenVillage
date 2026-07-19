namespace ProjectHiddenVillage.Server;

public sealed class Card
{
    public List<string> Name { get; set; } = [];

    public string DisplayName { get; set; } = string.Empty;

    public List<string> Type { get; set; } = [];

    public List<string> Traits { get; set; } = [];

    public int Cost { get; set; }

    public string Color { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public List<ConditionSpec> Conditions { get; set; } = [];

    public List<EffectSpec> Effects { get; set; } = [];
}

public sealed class ConditionSpec
{
    public string Id { get; set; } = string.Empty;

    public Dictionary<string, string> Args { get; set; } = [];
}

public sealed class EffectSpec
{
    public string Id { get; set; } = string.Empty;

    public Dictionary<string, string> Args { get; set; } = [];
}