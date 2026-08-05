namespace ProjectHiddenVillage.Server.Data.Entities;

public sealed class Deck
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid? UserId { get; set; }

    public User? User { get; set; }

    public List<DeckCard> Cards { get; set; } = [];

    public List<GameInstance> Player1GameInstances { get; set; } = [];

    public List<GameInstance> Player2GameInstances { get; set; } = [];
}
