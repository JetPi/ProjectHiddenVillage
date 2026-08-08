namespace ProjectHiddenVillage.Server;

public sealed class PlayerState
{
    public string PlayerId { get; set; } = string.Empty;

    public int ResourcePool { get; set; }

    public LeaderCardInstanceState? LeaderCardInstance { get; set; }

    public List<CardInstance> Deck { get; set; } = [];

    public List<CardInstance> Hand { get; set; } = [];

    public List<CardInstance> Battlefield { get; set; } = [];

    public List<CardInstance> DiscardPile { get; set; } = [];
}