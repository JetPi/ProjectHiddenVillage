namespace ProjectHiddenVillage.Server;

public sealed record DeckRulesetCardRestrictionResponse(string CardId, int MaxCopies);

public sealed record DeckRulesetResponse(
    Guid Id,
    string Key,
    string Name,
    bool IsActive,
    int LeaderCount,
    int NonLeaderCardCount,
    int MaxCopiesPerNonLeaderCard,
    bool RequireLeaderColorMatch,
    bool AllowChakraCards,
    bool AllowSummonCards,
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

public sealed record DeckRulesetCardRestrictionRequest(string CardId, int MaxCopies);

public sealed record CreateDeckRulesetRequest(
    string Key,
    string Name,
    bool IsActive,
    int LeaderCount,
    int NonLeaderCardCount,
    int MaxCopiesPerNonLeaderCard,
    bool RequireLeaderColorMatch,
    bool AllowChakraCards,
    bool AllowSummonCards,
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
    int LeaderCount,
    int NonLeaderCardCount,
    int MaxCopiesPerNonLeaderCard,
    bool RequireLeaderColorMatch,
    bool AllowChakraCards,
    bool AllowSummonCards,
    int SortOrder,
    IReadOnlyList<DeckRulesetCardRestrictionRequest> CardRestrictions,
    bool ClockEnabled = true,
    int MainPhaseSeconds = 60,
    int OtherPhaseSeconds = 30,
    int PlayerPoolSeconds = 1800,
    int TimeoutsBeforeForfeit = 3,
    bool AvailableInQuickMatch = true) : IDeckRulesetClockRequest;
