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
    IReadOnlyList<DeckRulesetCardRestrictionResponse> CardRestrictions);

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
    IReadOnlyList<DeckRulesetCardRestrictionRequest> CardRestrictions);

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
    IReadOnlyList<DeckRulesetCardRestrictionRequest> CardRestrictions);
