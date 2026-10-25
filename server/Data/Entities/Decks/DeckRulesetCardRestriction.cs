namespace ProjectHiddenVillage.Server.Data.Entities;

public sealed class DeckRulesetCardRestriction
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid DeckRulesetId { get; set; }

    public DeckRuleset DeckRuleset { get; set; } = null!;

    public Guid CardCatalogEntryId { get; set; }

    public CardCatalogEntry CardCatalogEntry { get; set; } = null!;

    public int MaxCopies { get; set; }
}
