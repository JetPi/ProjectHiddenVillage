namespace ProjectHiddenVillage.Server.Data.Entities;

public sealed class DeckCard
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid DeckId { get; set; }

    public Deck Deck { get; set; } = null!;

    public Guid CardCatalogEntryId { get; set; }

    public CardCatalogEntry CardCatalogEntry { get; set; } = null!;

    public int Quantity { get; set; }
}
