namespace ProjectHiddenVillage.Server.Data.Entities;

public sealed class CardCatalogEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string CardId { get; set; } = string.Empty;

    public string Image { get; set; } = string.Empty;

    public string OriginalId { get; set; } = string.Empty;

    public bool MainAlternate { get; set; }

    public string? Attribute { get; set; }

    public string DisplayName { get; set; } = string.Empty;

    public CardType Type { get; set; }

    public CardColor Color { get; set; }

    public string Description { get; set; } = string.Empty;

    public int Damage { get; set; }

    public int Power { get; set; }

    public string NameJson { get; set; } = "[]";

    public string TraitsJson { get; set; } = "[]";

    public string ConditionsJson { get; set; } = "[]";

    public string EffectsJson { get; set; } = "[]";

    public int? Life { get; set; }

    public int? Health { get; set; }

    public bool CannotBeNormalSummoned { get; set; }

    public string? SupportName { get; set; }

    public string? SupportEffect { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }
}