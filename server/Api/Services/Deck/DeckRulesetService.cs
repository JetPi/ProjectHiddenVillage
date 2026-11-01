using ErrorOr;
using Microsoft.EntityFrameworkCore;
using ProjectHiddenVillage.Server.Api.Interfaces.Deck;
using ProjectHiddenVillage.Server.Data;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server;

public sealed class DeckRulesetService : IDeckRulesetService
{
    private readonly ApplicationDbContext dbContext;

    public DeckRulesetService(ApplicationDbContext dbContext)
    {
        this.dbContext = dbContext;
    }

    public async Task<ErrorOr<List<DeckRulesetResponse>>> GetRulesets(bool includeInactive = false)
    {
        var query = dbContext.DeckRulesets
            .AsNoTracking()
            .Include(ruleset => ruleset.CardRestrictions)
            .AsQueryable();

        if (!includeInactive)
        {
            query = query.Where(ruleset => ruleset.IsActive);
        }

        var rulesets = await query
            .OrderBy(ruleset => ruleset.SortOrder)
            .ThenBy(ruleset => ruleset.Name)
            .ToListAsync();

        return rulesets.Select(ToResponse).ToList();
    }

    public async Task<ErrorOr<DeckRulesetDefinition>> GetActiveRulesetDefinition(Guid rulesetId)
    {
        var ruleset = await dbContext.DeckRulesets
            .AsNoTracking()
            .Include(record => record.CardRestrictions)
            .SingleOrDefaultAsync(record => record.Id == rulesetId);

        if (ruleset is null)
        {
            return Error.NotFound(
                code: "Deck.Rulesets.NotFound",
                description: $"Ruleset '{rulesetId}' was not found.");
        }

        if (!ruleset.IsActive)
        {
            return Error.Validation(
                code: "Deck.Rulesets.NotActive",
                description: $"Ruleset '{ruleset.Name}' is not active and cannot be played.");
        }

        return new DeckRulesetDefinition(
            Id: ruleset.Id,
            Key: ruleset.Key,
            Name: ruleset.Name,
            AvailableInQuickMatch: ruleset.AvailableInQuickMatch,
            LeaderCount: ruleset.LeaderCount,
            NonLeaderCardCount: ruleset.NonLeaderCardCount,
            MaxCopiesPerNonLeaderCard: ruleset.MaxCopiesPerNonLeaderCard,
            RequireLeaderColorMatch: ruleset.RequireLeaderColorMatch,
            CardPoolMode: ruleset.CardPoolMode,
            CardRules: ToCardRules(ruleset),
            Clock: ToClockPolicy(ruleset));
    }

    public async Task<ErrorOr<DeckRulesetResponse>> CreateRuleset(CreateDeckRulesetRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        var key = request.Key.Trim().ToLowerInvariant();
        var keyExists = await dbContext.DeckRulesets
            .AnyAsync(ruleset => ruleset.Key == key);

        if (keyExists)
        {
            return Error.Conflict(
                code: "Deck.Rulesets.KeyExists",
                description: $"A ruleset with the key '{key}' already exists.");
        }

        var clockValidation = ValidateClockSettings(
            request.MainPhaseSeconds,
            request.OtherPhaseSeconds,
            request.PlayerPoolSeconds,
            request.TimeoutsBeforeForfeit);
        if (clockValidation.IsError)
        {
            return clockValidation.Errors;
        }

        var restrictionResult = await ResolveRestrictionsAsync(request.CardRestrictions);
        if (restrictionResult.IsError)
        {
            return restrictionResult.Errors;
        }

        var cardPoolValidation = ValidateCardPool(request.CardPoolMode, restrictionResult.Value);
        if (cardPoolValidation.IsError)
        {
            return cardPoolValidation.Errors;
        }

        var now = DateTimeOffset.UtcNow;
        var ruleset = new DeckRuleset
        {
            Key = key,
            Name = request.Name.Trim(),
            IsActive = request.IsActive,
            CardPoolMode = request.CardPoolMode,
            AvailableInQuickMatch = request.AvailableInQuickMatch,
            LeaderCount = request.LeaderCount,
            NonLeaderCardCount = request.NonLeaderCardCount,
            MaxCopiesPerNonLeaderCard = request.MaxCopiesPerNonLeaderCard,
            RequireLeaderColorMatch = request.RequireLeaderColorMatch,
            ClockEnabled = request.ClockEnabled,
            MainPhaseSeconds = request.MainPhaseSeconds,
            OtherPhaseSeconds = request.OtherPhaseSeconds,
            PlayerPoolSeconds = request.PlayerPoolSeconds,
            TimeoutsBeforeForfeit = request.TimeoutsBeforeForfeit,
            SortOrder = request.SortOrder,
            CreatedAtUtc = now,
            UpdatedAtUtc = now,
            CardRestrictions = restrictionResult.Value,
        };

        dbContext.DeckRulesets.Add(ruleset);

        try
        {
            await dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            return Error.Failure(
                code: "Deck.Rulesets.PersistFailed",
                description: "The ruleset could not be persisted.");
        }

        return await GetRulesetResponseAsync(ruleset.Id);
    }

    public async Task<ErrorOr<DeckRulesetResponse>> UpdateRuleset(string rulesetId, UpdateDeckRulesetRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!Guid.TryParse(rulesetId, out var parsedRulesetId))
        {
            return Error.Validation(
                code: "Deck.Rulesets.InvalidId",
                description: "Ruleset id must be a valid GUID.");
        }

        var ruleset = await dbContext.DeckRulesets
            .Include(record => record.CardRestrictions)
            .SingleOrDefaultAsync(record => record.Id == parsedRulesetId);

        if (ruleset is null)
        {
            return Error.NotFound(
                code: "Deck.Rulesets.NotFound",
                description: $"Ruleset '{rulesetId}' was not found.");
        }

        if (ruleset.IsActive && !request.IsActive)
        {
            var hasOtherActiveRuleset = await dbContext.DeckRulesets
                .AnyAsync(record => record.Id != ruleset.Id && record.IsActive);

            if (!hasOtherActiveRuleset)
            {
                return Error.Validation(
                    code: "Deck.Rulesets.LastActive",
                    description: "At least one ruleset must stay active.");
            }
        }

        var clockValidation = ValidateClockSettings(
            request.MainPhaseSeconds,
            request.OtherPhaseSeconds,
            request.PlayerPoolSeconds,
            request.TimeoutsBeforeForfeit);
        if (clockValidation.IsError)
        {
            return clockValidation.Errors;
        }

        var restrictionResult = await ResolveRestrictionsAsync(request.CardRestrictions);
        if (restrictionResult.IsError)
        {
            return restrictionResult.Errors;
        }

        var cardPoolValidation = ValidateCardPool(request.CardPoolMode, restrictionResult.Value);
        if (cardPoolValidation.IsError)
        {
            return cardPoolValidation.Errors;
        }

        ruleset.Name = request.Name.Trim();
        ruleset.IsActive = request.IsActive;
        ruleset.CardPoolMode = request.CardPoolMode;
        ruleset.AvailableInQuickMatch = request.AvailableInQuickMatch;
        ruleset.LeaderCount = request.LeaderCount;
        ruleset.NonLeaderCardCount = request.NonLeaderCardCount;
        ruleset.MaxCopiesPerNonLeaderCard = request.MaxCopiesPerNonLeaderCard;
        ruleset.RequireLeaderColorMatch = request.RequireLeaderColorMatch;
        ruleset.ClockEnabled = request.ClockEnabled;
        ruleset.MainPhaseSeconds = request.MainPhaseSeconds;
        ruleset.OtherPhaseSeconds = request.OtherPhaseSeconds;
        ruleset.PlayerPoolSeconds = request.PlayerPoolSeconds;
        ruleset.TimeoutsBeforeForfeit = request.TimeoutsBeforeForfeit;
        ruleset.SortOrder = request.SortOrder;
        ruleset.UpdatedAtUtc = DateTimeOffset.UtcNow;

        var existingRestrictionsByMatcher = ruleset.CardRestrictions
            .ToDictionary(restriction => (restriction.MatchType, restriction.Code));

        foreach (var requestedRestriction in restrictionResult.Value)
        {
            var matcher = (requestedRestriction.MatchType, requestedRestriction.Code);

            if (existingRestrictionsByMatcher.Remove(matcher, out var existingRestriction))
            {
                existingRestriction.MaxCopies = requestedRestriction.MaxCopies;
                continue;
            }

            requestedRestriction.DeckRulesetId = ruleset.Id;
            dbContext.DeckRulesetCardRestrictions.Add(requestedRestriction);
        }

        if (existingRestrictionsByMatcher.Count > 0)
        {
            dbContext.DeckRulesetCardRestrictions.RemoveRange(existingRestrictionsByMatcher.Values);
        }

        try
        {
            await dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            return Error.Failure(
                code: "Deck.Rulesets.PersistFailed",
                description: "The ruleset could not be updated.");
        }

        return await GetRulesetResponseAsync(ruleset.Id);
    }

    public async Task<ErrorOr<bool>> DeleteRuleset(string rulesetId)
    {
        if (!Guid.TryParse(rulesetId, out var parsedRulesetId))
        {
            return Error.Validation(
                code: "Deck.Rulesets.InvalidId",
                description: "Ruleset id must be a valid GUID.");
        }

        var ruleset = await dbContext.DeckRulesets
            .Include(record => record.CardRestrictions)
            .SingleOrDefaultAsync(record => record.Id == parsedRulesetId);

        if (ruleset is null)
        {
            return Error.NotFound(
                code: "Deck.Rulesets.NotFound",
                description: $"Ruleset '{rulesetId}' was not found.");
        }

        if (ruleset.IsActive)
        {
            var hasOtherActiveRuleset = await dbContext.DeckRulesets
                .AnyAsync(record => record.Id != ruleset.Id && record.IsActive);

            if (!hasOtherActiveRuleset)
            {
                return Error.Validation(
                    code: "Deck.Rulesets.LastActive",
                    description: "At least one ruleset must stay active.");
            }
        }

        if (ruleset.CardRestrictions.Count > 0)
        {
            dbContext.DeckRulesetCardRestrictions.RemoveRange(ruleset.CardRestrictions);
        }

        dbContext.DeckRulesets.Remove(ruleset);

        try
        {
            await dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            return Error.Failure(
                code: "Deck.Rulesets.PersistFailed",
                description: "The ruleset could not be deleted.");
        }

        return true;
    }

    public async Task<ErrorOr<List<DeckRulesetSetCodeResponse>>> GetCardPoolSetCodes()
    {
        // Grouped in memory: a set code is a segment of the card id, which SQL cannot group by without
        // provider-specific string functions, and the catalogue is small enough that reading the ids is cheap.
        var cardIds = await dbContext.CardCatalogEntries
            .AsNoTracking()
            .Select(entry => entry.CardId)
            .ToListAsync();

        return cardIds
            .Where(cardId => !string.IsNullOrWhiteSpace(cardId))
            .Select(DeckRulesetRules.GetSetCode)
            .GroupBy(setCode => setCode, StringComparer.Ordinal)
            .Select(group => new DeckRulesetSetCodeResponse(group.Key, group.Count()))
            .OrderBy(setCode => setCode.Code, StringComparer.Ordinal)
            .ToList();
    }

    private async Task<ErrorOr<DeckRulesetResponse>> GetRulesetResponseAsync(Guid rulesetId)
    {
        var ruleset = await dbContext.DeckRulesets
            .AsNoTracking()
            .Include(record => record.CardRestrictions)
            .SingleOrDefaultAsync(record => record.Id == rulesetId);

        if (ruleset is null)
        {
            return Error.NotFound(
                code: "Deck.Rulesets.NotFound",
                description: $"Ruleset '{rulesetId}' was not found.");
        }

        return ToResponse(ruleset);
    }

    private async Task<ErrorOr<List<DeckRulesetCardRestriction>>> ResolveRestrictionsAsync(
        IReadOnlyList<DeckRulesetCardRestrictionRequest>? restrictions)
    {
        var requestedRestrictions = (restrictions ?? [])
            .Where(restriction => !string.IsNullOrWhiteSpace(restriction.Code))
            .Select(restriction => new DeckRulesetCardRestrictionRequest(
                restriction.MatchType,
                restriction.Code.Trim().ToUpperInvariant(),
                restriction.MaxCopies))
            .GroupBy(restriction => (restriction.MatchType, restriction.Code))
            .Select(group => group.First())
            .ToList();

        if (requestedRestrictions.Count == 0)
        {
            return new List<DeckRulesetCardRestriction>();
        }

        // Only whole-card rules are checked against the catalogue, because a typo there would silently do
        // nothing. A set rule may name a set nobody has published yet, which is exactly how a future placeholder
        // series is kept out of a format before its cards exist.
        var requestedCardCodes = requestedRestrictions
            .Where(restriction => restriction.MatchType == CardRestrictionMatchType.Card)
            .Select(restriction => restriction.Code)
            .ToHashSet(StringComparer.Ordinal);

        var knownCardCodes = requestedCardCodes.Count == 0
            ? new HashSet<string>(StringComparer.Ordinal)
            : (await dbContext.CardCatalogEntries
                .AsNoTracking()
                .Where(entry => requestedCardCodes.Contains(entry.CardId.ToUpper()))
                .Select(entry => entry.CardId)
                .ToListAsync())
                .Select(cardId => cardId.Trim().ToUpperInvariant())
                .ToHashSet(StringComparer.Ordinal);

        var unknownCardCodes = requestedCardCodes
            .Where(code => !knownCardCodes.Contains(code))
            .OrderBy(code => code, StringComparer.Ordinal)
            .ToList();

        if (unknownCardCodes.Count > 0)
        {
            return Error.Validation(
                code: "Deck.Rulesets.UnknownCards",
                description: $"Unknown card code(s): {string.Join(", ", unknownCardCodes)}.");
        }

        return requestedRestrictions
            .Select(restriction => new DeckRulesetCardRestriction
            {
                MatchType = restriction.MatchType,
                Code = restriction.Code,
                MaxCopies = restriction.MaxCopies,
            })
            .ToList();
    }

    private static DeckRulesetResponse ToResponse(DeckRuleset ruleset)
    {
        return new DeckRulesetResponse(
            Id: ruleset.Id,
            Key: ruleset.Key,
            Name: ruleset.Name,
            IsActive: ruleset.IsActive,
            CardPoolMode: ruleset.CardPoolMode,
            LeaderCount: ruleset.LeaderCount,
            NonLeaderCardCount: ruleset.NonLeaderCardCount,
            MaxCopiesPerNonLeaderCard: ruleset.MaxCopiesPerNonLeaderCard,
            RequireLeaderColorMatch: ruleset.RequireLeaderColorMatch,
            SortOrder: ruleset.SortOrder,
            CardRestrictions: ruleset.CardRestrictions
                .OrderBy(restriction => restriction.MatchType)
                .ThenBy(restriction => restriction.Code, StringComparer.Ordinal)
                .Select(restriction => new DeckRulesetCardRestrictionResponse(
                    MatchType: restriction.MatchType,
                    Code: restriction.Code,
                    MaxCopies: restriction.MaxCopies))
                .ToList(),
            ClockEnabled: ruleset.ClockEnabled,
            MainPhaseSeconds: ruleset.MainPhaseSeconds,
            OtherPhaseSeconds: ruleset.OtherPhaseSeconds,
            PlayerPoolSeconds: ruleset.PlayerPoolSeconds,
            TimeoutsBeforeForfeit: ruleset.TimeoutsBeforeForfeit,
            AvailableInQuickMatch: ruleset.AvailableInQuickMatch);
    }

    /// <summary>Projects the stored rules into the shape evaluation reads, ordered for a stable payload.</summary>
    private static List<DeckRulesetCardRule> ToCardRules(DeckRuleset ruleset)
    {
        return ruleset.CardRestrictions
            .OrderBy(restriction => restriction.MatchType)
            .ThenBy(restriction => restriction.Code, StringComparer.Ordinal)
            .Select(restriction => new DeckRulesetCardRule(
                restriction.MatchType,
                restriction.Code.Trim().ToUpperInvariant(),
                restriction.MaxCopies))
            .ToList();
    }

    /// <summary>
    /// A closed pool with no rule that allows anything would fail every deck, and it would look like a broken
    /// format rather than a misconfigured one, so the empty case is refused at write time.
    /// </summary>
    private static ErrorOr<Success> ValidateCardPool(
        CardPoolMode cardPoolMode,
        IReadOnlyCollection<DeckRulesetCardRestriction> rules)
    {
        if (cardPoolMode != CardPoolMode.AllowList || rules.Any(rule => rule.MaxCopies > 0))
        {
            return Result.Success;
        }

        return Error.Validation(
            code: "Deck.Rulesets.EmptyAllowList",
            description: "An allow-list ruleset needs at least one rule that allows a card or a set.");
    }

    /// <summary>The persisted columns as the policy a created game snapshots.</summary>
    private static GameClockPolicy ToClockPolicy(DeckRuleset ruleset)
    {
        return GameClockPolicy.FromSeconds(
            enabled: ruleset.ClockEnabled,
            mainPhaseSeconds: ruleset.MainPhaseSeconds,
            otherPhaseSeconds: ruleset.OtherPhaseSeconds,
            playerPoolSeconds: ruleset.PlayerPoolSeconds,
            timeoutsBeforeForfeit: ruleset.TimeoutsBeforeForfeit);
    }

    /// <summary>
    /// Rejects a clock configuration a game cannot run with. The budgets have to be positive because a zero
    /// budget arms an already-expired deadline, and at least one timeout has to be allowed or a player could never
    /// be forfeited for stalling.
    /// </summary>
    private static ErrorOr<Success> ValidateClockSettings(
        int mainPhaseSeconds,
        int otherPhaseSeconds,
        int playerPoolSeconds,
        int timeoutsBeforeForfeit)
    {
        if (mainPhaseSeconds <= 0 || otherPhaseSeconds <= 0 || playerPoolSeconds <= 0)
        {
            return Error.Validation(
                code: "Deck.Rulesets.InvalidClock",
                description: "Clock budgets must be positive: main phase, other phase and player pool are in seconds.");
        }

        if (mainPhaseSeconds > playerPoolSeconds || otherPhaseSeconds > playerPoolSeconds)
        {
            return Error.Validation(
                code: "Deck.Rulesets.InvalidClock",
                description: "A single stop's budget cannot exceed the player's whole-game pool.");
        }

        if (timeoutsBeforeForfeit <= 0)
        {
            return Error.Validation(
                code: "Deck.Rulesets.InvalidClock",
                description: "Timeouts before forfeit must be at least 1.");
        }

        return Result.Success;
    }
}
