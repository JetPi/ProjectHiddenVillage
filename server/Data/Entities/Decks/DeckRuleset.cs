namespace ProjectHiddenVillage.Server.Data.Entities;

public sealed class DeckRuleset
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string Key { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public bool IsActive { get; set; } = true;

    public int LeaderCount { get; set; } = 1;

    public int NonLeaderCardCount { get; set; }

    public int MaxCopiesPerNonLeaderCard { get; set; } = 4;

    public bool RequireLeaderColorMatch { get; set; } = true;

    public bool AllowChakraCards { get; set; }

    public bool AllowSummonCards { get; set; }

    public int SortOrder { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }

    public List<DeckRulesetCardRestriction> CardRestrictions { get; set; } = [];
}
