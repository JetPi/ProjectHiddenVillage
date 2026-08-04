namespace ProjectHiddenVillage.Server.Data.Entities;

public sealed class GameInstance
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid Player1UserId { get; set; }
    public User Player1User { get; set; } = null!;
    public Guid Player1DeckId { get; set; }
    public Deck Player1Deck { get; set; } = null!;
    public bool[] Player1CurrentChakras { get; set; } = new[] { true, true, true, true, true, true };
    public bool Player1SummonCard { get; set; } = true;

    public List<Player1RuntimeDeckCard> Player1RuntimeDeckCards { get; set; } = [];
    public List<Player1CharacterFieldCard> Player1CharacterFieldCards { get; set; } = [];
    public List<Player1SupportAreaCard> Player1SupportAreaCards { get; set; } = [];
    public List<Player1TrashCard> Player1TrashCards { get; set; } = [];


    public Guid Player2UserId { get; set; }
    public User Player2User { get; set; } = null!;
    public Guid Player2DeckId { get; set; }
    public Deck Player2Deck { get; set; } = null!;
    public bool[] Player2CurrentChakras { get; set; } = new[] { true, true, true, true, true, true };
    public bool Player2SummonCard { get; set; } = true;

    public List<Player2RuntimeDeckCard> Player2RuntimeDeckCards { get; set; } = [];
    public List<Player2CharacterFieldCard> Player2CharacterFieldCards { get; set; } = [];
    public List<Player2SupportAreaCard> Player2SupportAreaCards { get; set; } = [];
    public List<Player2TrashCard> Player2TrashCards { get; set; } = [];
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}
