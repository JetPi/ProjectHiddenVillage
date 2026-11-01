namespace ProjectHiddenVillage.Server.Data.Entities;

/// <summary>
/// One card-pool rule owned by a ruleset. It names a code, never a catalogue row: the rule keeps working if the
/// card is edited, and it applies to a placeholder card that does not exist yet. <c>MaxCopies</c> keeps a single
/// meaning everywhere - zero bans the matched cards, N caps them at N copies - and in an allow-list ruleset a
/// value of at least one is also what puts the matched cards in the pool.
/// </summary>
public sealed class DeckRulesetCardRestriction
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid DeckRulesetId { get; set; }

    public DeckRuleset DeckRuleset { get; set; } = null!;

    /// <summary>Whether <see cref="Code"/> is a whole card code or a set code.</summary>
    public CardRestrictionMatchType MatchType { get; set; }

    /// <summary>Upper-cased code. A set code is the text before the first dash of a card id.</summary>
    public string Code { get; set; } = string.Empty;

    public int MaxCopies { get; set; }
}
