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

    /// <summary>
    /// The seat's display name, copied from the <see cref="Player"/> that took it. The board names each side from it,
    /// next to that side's presence dot; a composition that never set one publishes an empty name and the board draws
    /// the dot alone.
    /// </summary>
    public string PlayerName { get; set; } = string.Empty;

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