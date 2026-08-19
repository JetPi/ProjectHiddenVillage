namespace ProjectHiddenVillage.Server;

public class Card
{
    public string Id { get; set; } = string.Empty;

    public string Image { get; set; } = string.Empty;

    public string OriginalId { get; set; } = string.Empty;

    public bool MainAlternate { get; set; }

    public string? Attribute { get; set; }

    public List<string> Name { get; set; } = [];

    public string DisplayName { get; set; } = string.Empty;

    public CardType Type { get; set; }

    public List<string> Traits { get; set; } = [];

    public CardColor Color { get; set; }

    public string Description { get; set; } = string.Empty;

    public string MainEffect { get; set; } = string.Empty;

    public int Damage { get; set; }

    public int Power { get; set; }

    public bool CannotBeNormalSummoned { get; set; } = false;

    public List<string> Conditions { get; set; } = [];

    public List<EffectSpec> Effects { get; set; } = [];
}

public sealed class LeaderCard : Card
{
    public int Life { get; set; }

    public string RecoveryEffect { get; set; } = string.Empty;
}

public sealed class CharacterCard : Card
{
    public int Health { get; set; }

    public string SupportName { get; set; } = string.Empty;

    public string SupportEffect { get; set; } = string.Empty;

    public int SupportCost { get; set; }
}