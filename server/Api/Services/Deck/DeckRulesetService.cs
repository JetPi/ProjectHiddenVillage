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
            .ThenInclude(restriction => restriction.CardCatalogEntry)
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
            .ThenInclude(restriction => restriction.CardCatalogEntry)
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
            AllowChakraCards: ruleset.AllowChakraCards,
            AllowSummonCards: ruleset.AllowSummonCards,
            MaxCopiesByCardId: ruleset.CardRestrictions
                .GroupBy(restriction => restriction.CardCatalogEntry.CardId, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(
                    group => group.Key,
                    group => group.Last().MaxCopies,
                    StringComparer.OrdinalIgnoreCase),
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

        var now = DateTimeOffset.UtcNow;
        var ruleset = new DeckRuleset
        {
            Key = key,
            Name = request.Name.Trim(),
            IsActive = request.IsActive,
            AvailableInQuickMatch = request.AvailableInQuickMatch,
            LeaderCount = request.LeaderCount,
            NonLeaderCardCount = request.NonLeaderCardCount,
            MaxCopiesPerNonLeaderCard = request.MaxCopiesPerNonLeaderCard,
            RequireLeaderColorMatch = request.RequireLeaderColorMatch,
            AllowChakraCards = request.AllowChakraCards,
            AllowSummonCards = request.AllowSummonCards,
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

        ruleset.Name = request.Name.Trim();
        ruleset.IsActive = request.IsActive;
        ruleset.AvailableInQuickMatch = request.AvailableInQuickMatch;
        ruleset.LeaderCount = request.LeaderCount;
        ruleset.NonLeaderCardCount = request.NonLeaderCardCount;
        ruleset.MaxCopiesPerNonLeaderCard = request.MaxCopiesPerNonLeaderCard;
        ruleset.RequireLeaderColorMatch = request.RequireLeaderColorMatch;
        ruleset.AllowChakraCards = request.AllowChakraCards;
        ruleset.AllowSummonCards = request.AllowSummonCards;
        ruleset.ClockEnabled = request.ClockEnabled;
        ruleset.MainPhaseSeconds = request.MainPhaseSeconds;
        ruleset.OtherPhaseSeconds = request.OtherPhaseSeconds;
        ruleset.PlayerPoolSeconds = request.PlayerPoolSeconds;
        ruleset.TimeoutsBeforeForfeit = request.TimeoutsBeforeForfeit;
        ruleset.SortOrder = request.SortOrder;
        ruleset.UpdatedAtUtc = DateTimeOffset.UtcNow;

        var existingRestrictionsByCardId = ruleset.CardRestrictions
            .ToDictionary(restriction => restriction.CardCatalogEntryId);

        foreach (var requestedRestriction in restrictionResult.Value)
        {
            if (existingRestrictionsByCardId.Remove(requestedRestriction.CardCatalogEntryId, out var existingRestriction))
            {
                existingRestriction.MaxCopies = requestedRestriction.MaxCopies;
                continue;
            }

            requestedRestriction.DeckRulesetId = ruleset.Id;
            dbContext.DeckRulesetCardRestrictions.Add(requestedRestriction);
        }

        if (existingRestrictionsByCardId.Count > 0)
        {
            dbContext.DeckRulesetCardRestrictions.RemoveRange(existingRestrictionsByCardId.Values);
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

    private async Task<ErrorOr<DeckRulesetResponse>> GetRulesetResponseAsync(Guid rulesetId)
    {
        var ruleset = await dbContext.DeckRulesets
            .AsNoTracking()
            .Include(record => record.CardRestrictions)
            .ThenInclude(restriction => restriction.CardCatalogEntry)
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
            .Where(restriction => !string.IsNullOrWhiteSpace(restriction.CardId))
            .Select(restriction => new DeckRulesetCardRestrictionRequest(
                restriction.CardId.Trim().ToUpperInvariant(),
                restriction.MaxCopies))
            .GroupBy(restriction => restriction.CardId, StringComparer.Ordinal)
            .Select(group => group.First())
            .ToList();

        if (requestedRestrictions.Count == 0)
        {
            return new List<DeckRulesetCardRestriction>();
        }

        var requestedCardIds = requestedRestrictions
            .Select(restriction => restriction.CardId)
            .ToHashSet(StringComparer.Ordinal);

        var catalogEntryIdsByCardId = await dbContext.CardCatalogEntries
            .AsNoTracking()
            .Where(entry => requestedCardIds.Contains(entry.CardId.ToUpper()))
            .Select(entry => new { entry.CardId, entry.Id })
            .ToDictionaryAsync(
                entry => entry.CardId.ToUpperInvariant(),
                entry => entry.Id,
                comparer: StringComparer.Ordinal);

        var unknownCardIds = requestedRestrictions
            .Select(restriction => restriction.CardId)
            .Where(cardId => !catalogEntryIdsByCardId.ContainsKey(cardId))
            .OrderBy(cardId => cardId, StringComparer.Ordinal)
            .ToList();

        if (unknownCardIds.Count > 0)
        {
            return Error.Validation(
                code: "Deck.Rulesets.UnknownCards",
                description: $"Unknown card id(s): {string.Join(", ", unknownCardIds)}.");
        }

        return requestedRestrictions
            .Select(restriction => new DeckRulesetCardRestriction
            {
                CardCatalogEntryId = catalogEntryIdsByCardId[restriction.CardId],
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
            LeaderCount: ruleset.LeaderCount,
            NonLeaderCardCount: ruleset.NonLeaderCardCount,
            MaxCopiesPerNonLeaderCard: ruleset.MaxCopiesPerNonLeaderCard,
            RequireLeaderColorMatch: ruleset.RequireLeaderColorMatch,
            AllowChakraCards: ruleset.AllowChakraCards,
            AllowSummonCards: ruleset.AllowSummonCards,
            SortOrder: ruleset.SortOrder,
            CardRestrictions: ruleset.CardRestrictions
                .OrderBy(restriction => restriction.CardCatalogEntry.CardId, StringComparer.OrdinalIgnoreCase)
                .Select(restriction => new DeckRulesetCardRestrictionResponse(
                    CardId: restriction.CardCatalogEntry.CardId,
                    MaxCopies: restriction.MaxCopies))
                .ToList(),
            ClockEnabled: ruleset.ClockEnabled,
            MainPhaseSeconds: ruleset.MainPhaseSeconds,
            OtherPhaseSeconds: ruleset.OtherPhaseSeconds,
            PlayerPoolSeconds: ruleset.PlayerPoolSeconds,
            TimeoutsBeforeForfeit: ruleset.TimeoutsBeforeForfeit,
            AvailableInQuickMatch: ruleset.AvailableInQuickMatch);
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
