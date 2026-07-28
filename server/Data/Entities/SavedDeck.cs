namespace ProjectHiddenVillage.Server.Data.Entities;

public sealed class SavedDeck
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid UserId { get; set; }

    public User User { get; set; } = null!;

    public string Name { get; set; } = string.Empty;

    public List<SavedDeckCard> Cards { get; set; } = [];
}