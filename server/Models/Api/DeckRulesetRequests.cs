namespace ProjectHiddenVillage.Server;

/// <summary>
/// One card-pool rule as the API exposes it. The matcher is a code, not a catalogue id, so a rule can name a set
/// and can outlive a catalogue edit.
/// </summary>
public sealed record DeckRulesetCardRestrictionResponse(
    CardRestrictionMatchType MatchType,
    string Code,
    int MaxCopies);

/// <summary>A set code present in the catalogue, with how many cards carry it. Feeds the rule editor.</summary>
public sealed record DeckRulesetSetCodeResponse(string Code, int CardCount);

public sealed record DeckRulesetResponse(
    Guid Id,
    string Key,
    string Name,
    bool IsActive,
    CardPoolMode CardPoolMode,
    int LeaderCount,
    int NonLeaderCardCount,
    int MaxCopiesPerNonLeaderCard,
    bool RequireLeaderColorMatch,
    int SortOrder,
    IReadOnlyList<DeckRulesetCardRestrictionResponse> CardRestrictions,
    // The action clock this format binds to the games created under it (see plans/game-action-clocks.md).
    bool ClockEnabled = true,
    int MainPhaseSeconds = 60,
    int OtherPhaseSeconds = 30,
    int PlayerPoolSeconds = 1800,
    int TimeoutsBeforeForfeit = 3,
    // Whether quick match may pair players on this format. Hosting, invites and joins ignore it, so a host-only
    // format is still fully playable; it is simply never offered by the matchmaker.
    bool AvailableInQuickMatch = true);

/// <summary>
/// The clock settings every create/update ruleset request carries. It exists so one validator rule set can be
/// shared by both requests instead of being copied into each of them.
/// </summary>
public interface IDeckRulesetClockRequest
{
    bool ClockEnabled { get; }

    int MainPhaseSeconds { get; }

    int OtherPhaseSeconds { get; }

    int PlayerPoolSeconds { get; }

    int TimeoutsBeforeForfeit { get; }
}

/// <summary>
/// A rule the admin screen submits: either a whole card code (<c>SAMPLE-3</c>) or a set code (<c>SAMPLE</c>),
/// plus the copy cap where zero bans the matched cards.
/// </summary>
public sealed record DeckRulesetCardRestrictionRequest(
    CardRestrictionMatchType MatchType,
    string Code,
    int MaxCopies);

public sealed record CreateDeckRulesetRequest(
    string Key,
    string Name,
    bool IsActive,
    CardPoolMode CardPoolMode,
    int LeaderCount,
    int NonLeaderCardCount,
    int MaxCopiesPerNonLeaderCard,
    bool RequireLeaderColorMatch,
    int SortOrder,
    IReadOnlyList<DeckRulesetCardRestrictionRequest> CardRestrictions,
    bool ClockEnabled = true,
    int MainPhaseSeconds = 60,
    int OtherPhaseSeconds = 30,
    int PlayerPoolSeconds = 1800,
    int TimeoutsBeforeForfeit = 3,
    bool AvailableInQuickMatch = true) : IDeckRulesetClockRequest;

public sealed record UpdateDeckRulesetRequest(
    string Name,
    bool IsActive,
    CardPoolMode CardPoolMode,
    int LeaderCount,
    int NonLeaderCardCount,
    int MaxCopiesPerNonLeaderCard,
    bool RequireLeaderColorMatch,
    int SortOrder,
    IReadOnlyList<DeckRulesetCardRestrictionRequest> CardRestrictions,
    bool ClockEnabled = true,
    int MainPhaseSeconds = 60,
    int OtherPhaseSeconds = 30,
    int PlayerPoolSeconds = 1800,
    int TimeoutsBeforeForfeit = 3,
    bool AvailableInQuickMatch = true) : IDeckRulesetClockRequest;
