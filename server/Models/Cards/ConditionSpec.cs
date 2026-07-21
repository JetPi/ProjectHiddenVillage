namespace ProjectHiddenVillage.Server;

public sealed class ConditionSpec
{
    public string Id { get; set; } = string.Empty;

    public Dictionary<string, string> Args { get; set; } = [];
}