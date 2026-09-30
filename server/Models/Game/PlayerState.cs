namespace ProjectHiddenVillage.Server;

public sealed class PlayerState
{
    /// <summary>
    /// Chakra cards a player starts the game with ("Each player starts the game with 5 chakra cards").
    /// <see cref="ResourcePool"/> holds how many of them are currently face up, so this is also the
    /// ceiling a chakra recovery can bring the pool back to.
    /// </summary>
    public const int ChakraCardCount = 5;

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