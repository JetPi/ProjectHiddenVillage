namespace ProjectHiddenVillage.Server.Data.Entities;

public enum DeckType
{
    Public,
    User,
}

public sealed class Deck
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public DeckType Type { get; set; }

    public Guid? UserId { get; set; }

    public User? User { get; set; }

    public List<DeckCard> Cards { get; set; } = [];
}
