namespace ProjectHiddenVillage.Server.Data.Entities;

public sealed class SavedDeckCard
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid SavedDeckId { get; set; }

    public SavedDeck SavedDeck { get; set; } = null!;

    public string CardId { get; set; } = string.Empty;

    public int Quantity { get; set; }
}