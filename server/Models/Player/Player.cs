namespace ProjectHiddenVillage.Server;

public sealed class Player
{
    public string Id { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string DisplayName { get; set; } = string.Empty;

    public List<string> Deck { get; set; } = new List<string>();

}