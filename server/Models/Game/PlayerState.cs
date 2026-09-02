namespace ProjectHiddenVillage.Server;

public sealed class PlayerState
{
    public string PlayerId { get; set; } = string.Empty;

    public int DeckShuffleSeed { get; set; }

    public int DeckShuffleCount { get; set; }

    public int TurnCount { get; set; }

    public int ResourcePool { get; set; }

    public LeaderCardInstanceState? LeaderCardInstance { get; set; }

    public List<CardInstance> Deck { get; set; } = [];

    public List<CardInstance> Hand { get; set; } = [];

    public List<CardInstance> Battlefield { get; set; } = [];

    public List<CardInstance> DiscardPile { get; set; } = [];

    public List<CardInstance> SupportZone { get; set; } = [];

    public List<CardInstance> ExileZone { get; set; } = [];
}