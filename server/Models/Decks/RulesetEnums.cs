namespace ProjectHiddenVillage.Server;

/// <summary>
/// How a ruleset decides which cards may be used at all. The pool is a property of the ruleset, never of the
/// card: one format may ban a card while another, with no rule naming it, keeps it legal. See
/// <c>plans/ruleset-card-pool-rules.md</c>.
/// </summary>
public enum CardPoolMode
{
    /// <summary>Every catalogue card is allowed unless a rule bans or limits it.</summary>
    Open,

    /// <summary>
    /// Only cards matched by a rule that allows at least one copy are in the pool. This is what keeps a
    /// placeholder set out of a format even when new placeholders are added to the catalogue later.
    /// </summary>
    AllowList,
}

/// <summary>
/// What a card rule matches. The two forms exist because a rule must be able to name a single card and to name
/// a whole set, and the set form has to be exact: <c>S</c> is a prefix of <c>SAMPLE</c>, so a set rule compares
/// only the segment before the first dash instead of scanning for a prefix.
/// </summary>
public enum CardRestrictionMatchType
{
    /// <summary>The whole card code, for example <c>SAMPLE-3</c>.</summary>
    Card,

    /// <summary>The set code: the text before the first dash, for example <c>SAMPLE</c>.</summary>
    Set,
}
