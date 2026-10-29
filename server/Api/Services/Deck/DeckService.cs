using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using ErrorOr;
using Microsoft.EntityFrameworkCore;
using ProjectHiddenVillage.Server.Api.Serialization;
using ProjectHiddenVillage.Server.Api.Interfaces.Deck;
using ProjectHiddenVillage.Server.Data;
using ProjectHiddenVillage.Server.Data.DTOs;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server;

public sealed partial class DeckService : IDeckService
{
    private static readonly JsonSerializerOptions SerializerOptions = CreateSerializerOptions();

    [GeneratedRegex(@"^\s*(\d+)x\s+([A-Za-z0-9\-]+)\s*$", RegexOptions.CultureInvariant)]
    private static partial Regex DeckLinePattern();

    private readonly ApplicationDbContext dbContext;

    public DeckService(ApplicationDbContext dbContext)
    {
        this.dbContext = dbContext;
    }

    private static JsonSerializerOptions CreateSerializerOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        options.Converters.Add(new FlexibleEnumJsonConverterFactory());
        return options;
    }

    public Task<ErrorOr<string>> CreateDeck(CreateDeckRequest request)
    {
        return CreateDeckAsync(request, enforceRulesets: true);
    }

    /// <summary>
    /// Creates a deck without a ruleset evaluation.
    ///
    /// Only reachable through the test-only <see cref="TestDecksController"/>. The e2e suite mints engine fixtures
    /// (a 25-card deck holding 24 copies of one card, a three-card combination that makes one interaction certain)
    /// that no format can ever accept, so they must be creatable while staying unsavable for a player.
    /// </summary>
    public Task<ErrorOr<string>> CreateFixtureDeckAsync(CreateDeckRequest request)
    {
        return CreateDeckAsync(request, enforceRulesets: false);
    }

    private async Task<ErrorOr<string>> CreateDeckAsync(CreateDeckRequest request, bool enforceRulesets)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (string.IsNullOrWhiteSpace(request.Cards))
        {
            return Error.Validation(
                    code: "Deck.Create.EmptyCards",
                    description: "Cards payload is required.");
        }

        if (request.Type == DeckType.User && !request.UserId.HasValue)
        {
            return Error.Validation(
                    code: "Deck.Create.UserDeckRequiresUserId",
                    description: "UserId is required when deck type is User.");
        }

        if (request.UserId.HasValue)
        {
            var userExists = await dbContext.Users.AnyAsync(user => user.Id == request.UserId.Value);
            if (!userExists)
            {
                return Error.NotFound(
                        code: "Deck.Create.UserNotFound",
                        description: $"User '{request.UserId.Value}' was not found.");
            }
        }

        var parseResult = ParseCards(request.Cards);
        if (parseResult.IsError)
        {
            return parseResult.Errors;
        }

        var parsedCards = parseResult.Value;
        var requestedCardIds = parsedCards
                .Select(card => card.CardId)
                .ToHashSet(StringComparer.Ordinal);

        var cardCatalogEntries = await dbContext.CardCatalogEntries
                .AsNoTracking()
                .Where(entry => requestedCardIds.Contains(entry.CardId.ToUpper()))
            .Select(entry => new { entry.Id, entry.CardId, entry.Type, entry.Color })
                .ToListAsync();

        var cardCatalogById = cardCatalogEntries
                .ToDictionary(
                        keySelector: entry => entry.CardId.ToUpperInvariant(),
                        elementSelector: entry => entry.Id,
                        comparer: StringComparer.Ordinal);

        var missingCardIds = parsedCards
                .Select(card => card.CardId)
                .Where(cardId => !cardCatalogById.ContainsKey(cardId))
                .Distinct(StringComparer.Ordinal)
                .ToList();

        if (missingCardIds.Count > 0)
        {
            return Error.Validation(
                    code: "Deck.Create.UnknownCardIds",
                    description: $"Unknown card id(s): {string.Join(", ", missingCardIds)}.");
        }

        var metadataByCardId = cardCatalogEntries
            .GroupBy(entry => entry.CardId.Trim().ToUpperInvariant(), StringComparer.Ordinal)
            .ToDictionary(
                group => group.Key,
                group => new DeckRuleCardMetadata(group.First().CardId, group.First().Type, group.First().Color),
                comparer: StringComparer.Ordinal);

        if (enforceRulesets)
        {
            var activeRulesets = await LoadActiveRulesetDefinitionsAsync();
            var rulesetValidation = DeckRulesetRules.Evaluate(
                parsedCards.Select(card => new DeckRuleCard(card.CardId, card.Quantity)),
                metadataByCardId,
                activeRulesets);

            if (!rulesetValidation.IsLegalInAnyRuleset)
            {
                return ToRulesetErrors(rulesetValidation);
            }
        }

        var deckName = request.Name?.Trim() ?? string.Empty;
        if (deckName.Length > 128)
        {
            return Error.Validation(
                    code: "Deck.Create.NameTooLong",
                    description: "Deck name cannot exceed 128 characters.");
        }

        var deck = new Deck
        {
            Type = request.Type,
            Name = deckName,
            UserId = request.UserId,
            Cards = parsedCards.ConvertAll(card => new DeckCard
            {
                CardCatalogEntryId = cardCatalogById[card.CardId],
                Quantity = card.Quantity
            })
        };

        dbContext.Decks.Add(deck);

        try
        {
            await dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            return Error.Failure(
                    code: "Deck.Create.PersistFailed",
                    description: "Deck could not be persisted.");
        }

        return deck.Id.ToString();
    }

    public async Task<ErrorOr<DeckResponse>> CreatePublicDeckAsync(CreatePublicDeckRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        var resolveResult = await ResolveDeckCardsAsync(request.Cards);
        if (resolveResult.IsError)
        {
            return resolveResult.Errors;
        }

        var deck = new Deck
        {
            Type = DeckType.Public,
            Name = request.Name.Trim(),
            UserId = null,
            Cards = resolveResult.Value,
        };

        dbContext.Decks.Add(deck);

        try
        {
            await dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            return Error.Failure(
                    code: "Deck.Create.PersistFailed",
                    description: "Deck could not be persisted.");
        }

        return await GetDeck(deck.Id.ToString(), populate: false);
    }

    public async Task<ErrorOr<DeckResponse>> UpdateDeckAsync(
            string deckId,
            UpdateDeckRequest request,
            Guid? requestingUserId = null,
            bool isAdmin = false)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!Guid.TryParse(deckId, out var parsedDeckId))
        {
            return Error.Validation(
                    code: "Deck.Update.InvalidId",
                    description: "Deck id must be a valid GUID.");
        }

        var deck = await dbContext.Decks
                .Include(record => record.Cards)
                .ThenInclude(card => card.CardCatalogEntry)
                .SingleOrDefaultAsync(record => record.Id == parsedDeckId);

        if (deck is null)
        {
            return Error.NotFound(
                    code: "Deck.Update.NotFound",
                    description: $"Deck '{deckId}' was not found.");
        }

        // The same rule the delete endpoint uses: a player edits their own deck, an admin curates the catalogue.
        if (!isAdmin && (requestingUserId is null || deck.UserId != requestingUserId))
        {
            return Error.Forbidden(
                    code: "Deck.Update.Forbidden",
                    description: "This deck does not belong to you.");
        }

        var deckName = request.Name.Trim();
        if (deckName.Length > 128)
        {
            return Error.Validation(
                    code: "Deck.Update.NameTooLong",
                    description: "Deck name cannot exceed 128 characters.");
        }

        var resolveResult = await ResolveDeckCardsAsync(request.Cards);
        if (resolveResult.IsError)
        {
            return resolveResult.Errors;
        }

        // The leader is what makes a deck *that deck*: swapping it is a new deck wearing the old name, so the record
        // starts over. Everything else - a ratio tweak, a tech card, a different name - keeps the record, because a
        // player tuning a list they have already played should not lose what it earned on the way. Computed before
        // the reconciliation below mutates the stored rows.
        var requestedLeaderCardIds = await ResolveRequestedLeaderCardIdsAsync(request.Cards);
        var leaderChanged = HasLeaderChanged(deck.Cards, requestedLeaderCardIds);

        deck.Name = deckName;

        var existingCardsByCatalogEntryId = deck.Cards.ToDictionary(card => card.CardCatalogEntryId);

        foreach (var requestedCard in resolveResult.Value)
        {
            if (existingCardsByCatalogEntryId.Remove(requestedCard.CardCatalogEntryId, out var existingCard))
            {
                existingCard.Quantity = requestedCard.Quantity;
                continue;
            }

            requestedCard.DeckId = deck.Id;
            dbContext.DeckCards.Add(requestedCard);
        }

        if (existingCardsByCatalogEntryId.Count > 0)
        {
            dbContext.DeckCards.RemoveRange(existingCardsByCatalogEntryId.Values);
        }

        if (leaderChanged)
        {
            // Every player's row for this deck goes, not just the owner's: the leader defines the deck, so a public
            // deck edited by an admin has a new identity for everyone who played the old one. The delete rides in the
            // same SaveChanges as the card reconciliation, so a reset can never land without the edit.
            var records = await dbContext.DeckRecords
                    .Where(record => record.DeckId == deck.Id)
                    .ToListAsync();

            if (records.Count > 0)
            {
                dbContext.DeckRecords.RemoveRange(records);
            }
        }

        try
        {
            await dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            return Error.Failure(
                    code: "Deck.Update.PersistFailed",
                    description: "The deck could not be updated.");
        }

        return await GetDeck(deck.Id.ToString(), populate: false, viewerUserId: requestingUserId);
    }

    public async Task<ErrorOr<bool>> DeleteDeck(string deckId, Guid? requestingUserId = null, bool isAdmin = false)
    {
        if (!Guid.TryParse(deckId, out var parsedDeckId))
        {
            return Error.Validation(
                    code: "Deck.Delete.InvalidId",
                    description: "Deck id must be a valid GUID.");
        }

        var deck = await dbContext.Decks
                .Include(record => record.Cards)
                .SingleOrDefaultAsync(record => record.Id == parsedDeckId);

        if (deck is null)
        {
            return Error.NotFound(
                    code: "Deck.Delete.NotFound",
                    description: $"Deck '{deckId}' was not found.");
        }

        // A saved deck belongs to exactly one player, and a public deck belongs to nobody: only the owner (or an
        // administrator, who curates the shared catalogue) may remove it. Guests own no decks, so they always land
        // on the refusal.
        if (!isAdmin && (requestingUserId is null || deck.UserId != requestingUserId))
        {
            return Error.Forbidden(
                    code: "Deck.Delete.Forbidden",
                    description: "This deck does not belong to you.");
        }

        // A game instance keeps a restricting FK to both deck slots, so deleting a deck out from under a game
        // would fail in the database. Reporting it first turns that into a clear conflict instead of a 500.
        var assignedToGame = await dbContext.GameInstances
                .AnyAsync(game => game.Player1DeckId == parsedDeckId || game.Player2DeckId == parsedDeckId);

        if (assignedToGame)
        {
            return Error.Conflict(
                    code: "Deck.Delete.InUse",
                    description: $"Deck '{deckId}' is assigned to a game instance.");
        }

        if (deck.Cards.Count > 0)
        {
            dbContext.DeckCards.RemoveRange(deck.Cards);
        }

        dbContext.Decks.Remove(deck);

        try
        {
            await dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            return Error.Failure(
                    code: "Deck.Delete.PersistFailed",
                    description: "The deck could not be deleted.");
        }

        return true;
    }

    public async Task<ErrorOr<DeckResponse>> GetDeck(
            string deckId,
            bool populate = false,
            Guid? viewerUserId = null)
    {
        if (!Guid.TryParse(deckId, out var parsedDeckId))
        {
            return Error.Validation(
                    code: "Deck.Get.InvalidId",
                    description: "Deck id must be a valid GUID.");
        }

        if (!populate)
        {
            var deck = await dbContext.Decks
                    .AsNoTracking()
                    .Where(record => record.Id == parsedDeckId)
                    .Select(ToDeckProjectionExpression())
                    .SingleOrDefaultAsync();

            if (deck is null)
            {
                return Error.NotFound(
                        code: "Deck.Get.NotFound",
                        description: $"Deck '{deckId}' was not found.");
            }

            return ToDeckResponse(deck, await LoadViewerRecordAsync(parsedDeckId, viewerUserId));
        }

        var deckWithCards = await dbContext.Decks
                .AsNoTracking()
                .Include(record => record.Cards)
                .ThenInclude(card => card.CardCatalogEntry)
                .SingleOrDefaultAsync(record => record.Id == parsedDeckId);

        if (deckWithCards is null)
        {
            return Error.NotFound(
                    code: "Deck.Get.NotFound",
                    description: $"Deck '{deckId}' was not found.");
        }

        return ToDeckResponse(
                deckWithCards,
                populate: true,
                await LoadViewerRecordAsync(parsedDeckId, viewerUserId));
    }

    public async Task<ErrorOr<List<DeckResponse>>> GetDecks(
        Guid? userId = null,
        bool populate = false,
        DeckType? type = null,
        Guid? viewerUserId = null)
    {
        if (!populate)
        {
            var query = dbContext.Decks.AsNoTracking();

            if (userId.HasValue)
            {
                query = query.Where(record => record.UserId == userId.Value);
            }

            if (type.HasValue)
            {
                query = query.Where(record => record.Type == type.Value);
            }

            var deckProjections = await query
                    .OrderBy(record => record.Id)
                    .Select(ToDeckProjectionExpression())
                    .ToListAsync();

            var recordsByDeckId = await LoadViewerRecordsAsync(
                    deckProjections.Select(deck => deck.Id),
                    viewerUserId);

            return deckProjections
                    .Select(deck => ToDeckResponse(deck, recordsByDeckId.GetValueOrDefault(deck.Id)))
                    .ToList();
        }

        var populatedQuery = dbContext.Decks
                .AsNoTracking()
                .Include(record => record.Cards)
                .ThenInclude(card => card.CardCatalogEntry)
                .AsQueryable();

        if (userId.HasValue)
        {
            populatedQuery = populatedQuery.Where(record => record.UserId == userId.Value);
        }

        if (type.HasValue)
        {
            populatedQuery = populatedQuery.Where(record => record.Type == type.Value);
        }

        var decks = await populatedQuery
                .OrderBy(record => record.Id)
                .ToListAsync();

        var populatedRecordsByDeckId = await LoadViewerRecordsAsync(
                decks.Select(deck => deck.Id),
                viewerUserId);

        return decks
                .Select(deck => ToDeckResponse(
                        deck,
                        populate: true,
                        record: populatedRecordsByDeckId.GetValueOrDefault(deck.Id)))
                .ToList();
    }

    /// <summary>
    /// The requesting player's records for the listed decks, keyed by deck. Without a viewer this is empty: a deck
    /// listing is public, but a win/loss record is the player's own, so it is only ever read for the viewer.
    /// </summary>
    private async Task<Dictionary<Guid, DeckRecordResponse>> LoadViewerRecordsAsync(
            IEnumerable<Guid> deckIds,
            Guid? viewerUserId)
    {
        if (viewerUserId is not { } viewerId)
        {
            return [];
        }

        var ids = deckIds.Distinct().ToList();
        if (ids.Count == 0)
        {
            return [];
        }

        var records = await dbContext.DeckRecords
                .AsNoTracking()
                .Where(record => record.UserId == viewerId && ids.Contains(record.DeckId))
                .Select(record => new
                {
                    record.DeckId,
                    record.Wins,
                    record.Losses,
                    record.Draws,
                })
                .ToListAsync();

        return records.ToDictionary(
                record => record.DeckId,
                record => new DeckRecordResponse(record.Wins, record.Losses, record.Draws));
    }

    /// <summary>The requesting player's record for one deck, if they have one.</summary>
    private async Task<DeckRecordResponse?> LoadViewerRecordAsync(Guid deckId, Guid? viewerUserId)
    {
        var records = await LoadViewerRecordsAsync([deckId], viewerUserId);

        return records.GetValueOrDefault(deckId);
    }

    /// <summary>
    /// The leader cards among the requested cards. It answers the one question the record depends on: does this save
    /// replace the deck's leader? Quantities, the rest of the list and the name are deliberately outside it.
    /// </summary>
    private async Task<List<string>> ResolveRequestedLeaderCardIdsAsync(
            IReadOnlyList<DeckCardRequest>? requestedCards)
    {
        var requestedCardIds = (requestedCards ?? [])
                .Where(card => !string.IsNullOrWhiteSpace(card.CardId))
                .Select(card => card.CardId.Trim().ToUpperInvariant())
                .ToHashSet(StringComparer.Ordinal);

        if (requestedCardIds.Count == 0)
        {
            return [];
        }

        return await dbContext.CardCatalogEntries
                .AsNoTracking()
                .Where(entry => entry.Type == CardType.Leader && requestedCardIds.Contains(entry.CardId.ToUpper()))
                .Select(entry => entry.CardId)
                .ToListAsync();
    }

    /// <summary>
    /// True when the set of leader cards is not the one the deck already had. Identities only: swapping the leader,
    /// adding one or dropping it is a new deck, while tuning the rest of the list is still the same deck.
    /// </summary>
    private static bool HasLeaderChanged(
            IReadOnlyCollection<DeckCard> storedCards,
            IReadOnlyCollection<string> requestedLeaderCardIds)
    {
        var storedLeaderCardIds = storedCards
                .Select(card => card.CardCatalogEntry)
                .Where(entry => entry.Type == CardType.Leader)
                .Select(entry => entry.CardId.Trim().ToUpperInvariant())
                .ToHashSet(StringComparer.Ordinal);

        var requestedLeaders = requestedLeaderCardIds
                .Select(cardId => cardId.Trim().ToUpperInvariant())
                .ToHashSet(StringComparer.Ordinal);

        return !storedLeaderCardIds.SetEquals(requestedLeaders);
    }

    private static System.Linq.Expressions.Expression<Func<Deck, DeckProjection>> ToDeckProjectionExpression()
    {
        return deck => new DeckProjection(
                Id: deck.Id,
                Name: deck.Name,
                Type: deck.Type,
                UserId: deck.UserId,
                HasLeader: deck.Cards.Any(card => card.CardCatalogEntry.Type == CardType.Leader),
                LeaderColor: deck.Cards
                        .Where(card => card.CardCatalogEntry.Type == CardType.Leader)
                        .OrderBy(card => card.CardCatalogEntry.CardId)
                        .Select(card => card.CardCatalogEntry.Color)
                        .FirstOrDefault(),
                LeaderCardId: deck.Cards
                        .Where(card => card.CardCatalogEntry.Type == CardType.Leader)
                        .OrderBy(card => card.CardCatalogEntry.CardId)
                        .Select(card => card.CardCatalogEntry.CardId)
                        .FirstOrDefault(),
                Cards: deck.Cards
                        .OrderBy(card => card.CardCatalogEntry.CardId)
                        .Select(card => new DeckCardResponse(
                                CardId: card.CardCatalogEntry.CardId,
                                Quantity: card.Quantity))
                        .ToList());
    }

    private static DeckResponse ToDeckResponse(DeckProjection deck, DeckRecordResponse? record)
    {
        return new DeckResponse(
                Id: deck.Id,
                Name: deck.Name,
                Type: deck.Type.ToString(),
                UserId: deck.UserId,
                LeaderColor: deck.HasLeader ? ToReadableCardColor(deck.LeaderColor) : null,
                Cards: deck.Cards,
                Record: record,
                LeaderCardId: deck.LeaderCardId);
    }

    private static DeckResponse ToDeckResponse(Deck deck, bool populate, DeckRecordResponse? record = null)
    {
        var leaderEntry = deck.Cards
                .OrderBy(card => card.CardCatalogEntry.CardId)
                .Select(card => card.CardCatalogEntry)
                .FirstOrDefault(entry => entry.Type == CardType.Leader);

        return new DeckResponse(
                Id: deck.Id,
                Name: deck.Name,
                Type: deck.Type.ToString(),
                UserId: deck.UserId,
                LeaderColor: leaderEntry is null ? null : ToReadableCardColor(leaderEntry.Color),
                Cards: deck.Cards
                        .OrderBy(card => card.CardCatalogEntry.CardId)
                        .Select(card => new DeckCardResponse(
                                CardId: card.CardCatalogEntry.CardId,
                                Quantity: card.Quantity,
                                Card: populate ? ToCatalogResponse(card.CardCatalogEntry) : null))
                        .ToList(),
                Record: record,
                LeaderCardId: leaderEntry?.CardId);
    }

    private sealed record DeckProjection(
        Guid Id,
        string Name,
        DeckType Type,
        Guid? UserId,
        bool HasLeader,
        CardColor LeaderColor,
        string? LeaderCardId,
        List<DeckCardResponse> Cards);

    private static CardCatalogItemResponse ToCatalogResponse(CardCatalogEntry entry)
    {
        var names = DeserializeOrDefault<List<string>>(entry.NameJson, []);
        var traits = DeserializeOrDefault<List<string>>(entry.TraitsJson, []);
        var conditions = DeserializeConditions(entry.ConditionsJson);
        var effects = DeserializeOrDefault<List<EffectSpec>>(entry.EffectsJson, []);
        var supportCost = ResolveSupportDisplayCost(effects);

        return new CardCatalogItemResponse(
                Id: entry.CardId,
                Image: entry.Image,
                Name: names,
                DisplayName: entry.DisplayName,
                Type: ToReadableCardType(entry.Type),
                Traits: traits,
                Color: ToReadableCardColor(entry.Color),
                Description: entry.Description,
                Damage: entry.Damage,
                Power: entry.Power,
                Conditions: conditions,
                Effects: effects
                        .ConvertAll(effect => new CardCatalogEffectResponse(
                                Id: effect.Id,
                    IsSubordinate: effect.IsSubordinate,
                    OnSuccessEffectId: effect.OnSuccessEffectId,
                    OnFailureEffectId: effect.OnFailureEffectId,
                        RuntimeEffectType: ToReadableRuntimeEffect(effect.RuntimeEffectType),
                        EffectType: ToReadableEffectKind(effect.EffectType),
                                Timing: ToReadableEffectTiming(effect.Timing),
                        DurationMode: ToReadableEffectDurationMode(effect.DurationMode),
                        PassiveMode: SplitPascalCase(effect.PassiveMode.ToString()),
                        PassiveReevaluation: ToPassiveReevaluationResponse(effect.PassiveReevaluation),
                        PassiveConsequences: effect.PassiveConsequences
                            .Select(ToPassiveConsequenceResponse)
                            .ToList(),
                        KeywordModifications: effect.KeywordModifications
                            .Select(ToKeywordModificationResponse)
                            .ToList(),
                        TargetRange: ToReadableEffectTargetRange(effect.TargetRange),
                        IsOptional: effect.IsOptional,
                        ChakraCost: effect.ChakraCost,
                        GlobalRestrictions: ToReadableEffectRestrictions(effect.GlobalRestrictions),
                    ExecutionTargetSource: SplitPascalCase(effect.ExecutionTargetSource.ToString()),
                    ExecutionFlowMode: SplitPascalCase(effect.ExecutionFlowMode.ToString()),
                    SuppressSummonedTargetsEffectsWhileOnField: effect.SuppressSummonedTargetsEffectsWhileOnField,
                    RevealTimingMode: SplitPascalCase(effect.RevealTimingMode.ToString()),
                    RevealPostConditionRuleSet: ToNullableZoneCardRestrictionRuleSetResponse(ResolveRevealPostConditionRuleSet(effect)),
                    RevealPostConditionRestriction: ToNullableZoneCardRestrictionResponse(ResolveRevealPostConditionRestriction(effect)),
                    RevealPostConditionPredicate: ToNullableZoneCardPropertyPredicateResponse(ResolveRevealPostConditionPredicate(effect)),
                    ExecutionCondition: ToExecutionConditionResponse(effect.ExecutionCondition),
                    AttributeModifications: effect.AttributeModifications
                        .Select(ToAttributeModificationResponse)
                        .ToList(),
                    ChakraAdjustments: effect.ChakraAdjustments
                        .Select(ToChakraAdjustmentResponse)
                        .ToList(),
                    SummonCardFlips: effect.SummonCardFlips
                        .Select(ToSummonCardFlipResponse)
                        .ToList(),
                    FaceStateLocks: effect.FaceStateLocks
                        .Select(ToFaceStateLockResponse)
                        .ToList(),
                    MoveCardActions: effect.MoveCardActions
                        .Select(ToMoveCardActionResponse)
                        .ToList(),
                    ContextRules: effect.ContextRules
                        .Select(ToContextRuleResponse)
                        .ToList(),
                    TargetRules: ToTargetRuleSetResponse(effect.TargetRules))),
                Life: entry.Life,
                Health: entry.Health,
                CannotBeNormalSummoned: entry.CannotBeNormalSummoned,
                SupportName: entry.SupportName,
                SupportEffect: entry.SupportEffect,
                SupportCost: supportCost,
                ImageVersion: entry.UpdatedAtUtc.ToUnixTimeMilliseconds());
    }

    private static int? ResolveSupportDisplayCost(IReadOnlyList<EffectSpec> effects)
    {
        return effects
            .Where(effect => effect.EffectType == EffectKind.Support && effect.ChakraCost.HasValue)
            .Select(effect => effect.ChakraCost)
            .FirstOrDefault();
    }

    private static T DeserializeOrDefault<T>(string json, T fallback)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return fallback;
        }

        try
        {
            return JsonSerializer.Deserialize<T>(json, SerializerOptions) ?? fallback;
        }
        catch (JsonException)
        {
            return fallback;
        }
    }

    private static List<string> DeserializeConditions(string json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return [];
        }

        try
        {
            var asStrings = JsonSerializer.Deserialize<List<string>>(json, SerializerOptions);
            if (asStrings is not null)
            {
                return asStrings
                    .Where(condition => !string.IsNullOrWhiteSpace(condition))
                    .Select(condition => condition.Trim())
                    .ToList();
            }
        }
        catch (JsonException)
        {
        }

        try
        {
            var legacy = JsonSerializer.Deserialize<List<LegacyConditionSpec>>(json, SerializerOptions) ?? [];
            return legacy
                .Select(condition => condition.Id)
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .Select(id => id.Trim())
                .ToList();
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static string ToReadableCardType(CardType type)
    {
        return type switch
        {
            CardType.ExCharacter => "EX Character",
            _ => SplitPascalCase(type.ToString())
        };
    }

    private static string ToReadableCardColor(CardColor color)
    {
        return color switch
        {
            CardColor.NotApplicable => "N/A",
            _ => SplitPascalCase(color.ToString())
        };
    }

    private static string ToReadableEffectKind(EffectKind kind)
    {
        return SplitPascalCase(kind.ToString());
    }

    private static string ToReadableRuntimeEffect(RuntimeEffects runtimeEffect)
    {
        return SplitPascalCase(runtimeEffect.ToString());
    }

    private static string ToReadableEffectTiming(EffectTiming timing)
    {
        return SplitPascalCase(timing.ToString());
    }

    private static string ToReadableEffectDurationMode(EffectDurationMode durationMode)
    {
        return SplitPascalCase(durationMode.ToString());
    }

    private static string ToReadableEffectTargetRange(EffectTargetRange targetRange)
    {
        return SplitPascalCase(targetRange.ToString());
    }

    private static string ToReadableEffectRestrictions(EffectRestrictions restrictions)
    {
        return SplitPascalCase(restrictions.ToString());
    }

    private static CardCatalogAttributeModificationResponse ToAttributeModificationResponse(AttributeModificationSpec spec)
    {
        return new CardCatalogAttributeModificationResponse(
            TargetType: SplitPascalCase(spec.TargetType.ToString()),
            TargetRange: SplitPascalCase(spec.TargetRange.ToString()),
            Attribute: SplitPascalCase(spec.Attribute.ToString()),
            Operation: SplitPascalCase(spec.Operation.ToString()),
            Value: spec.Value,
            MinimumValue: spec.MinimumValue,
            MaximumValue: spec.MaximumValue);
    }

    private static CardCatalogChakraAdjustmentResponse ToChakraAdjustmentResponse(ChakraAdjustmentSpec spec)
    {
        return new CardCatalogChakraAdjustmentResponse(
            TargetRange: SplitPascalCase(spec.TargetRange.ToString()),
            Operation: SplitPascalCase(spec.Operation.ToString()),
            Amount: spec.Amount);
    }

    private static CardCatalogSummonCardFlipResponse ToSummonCardFlipResponse(SummonCardFlipSpec spec)
    {
        return new CardCatalogSummonCardFlipResponse(
            TargetCategory: SplitPascalCase(spec.TargetCategory.ToString()),
            TargetRange: SplitPascalCase(spec.TargetRange.ToString()),
            FaceState: SplitPascalCase(spec.FaceState.ToString()));
    }

    private static CardCatalogFaceStateLockResponse ToFaceStateLockResponse(FaceStateLockSpec spec)
    {
        return new CardCatalogFaceStateLockResponse(
            TargetCategory: SplitPascalCase(spec.TargetCategory.ToString()),
            Operation: SplitPascalCase(spec.Operation.ToString()),
            TargetRange: SplitPascalCase(spec.TargetRange.ToString()));
    }

    private static CardCatalogMoveCardActionResponse ToMoveCardActionResponse(MoveCardActionSpec spec)
    {
        return new CardCatalogMoveCardActionResponse(
            Operation: SplitPascalCase(spec.Operation.ToString()),
            SourceZone: spec.SourceZone.HasValue ? SplitPascalCase(spec.SourceZone.Value.ToString()) : null,
            DestinationZone: spec.DestinationZone.HasValue ? SplitPascalCase(spec.DestinationZone.Value.ToString()) : null,
            DrawCount: spec.DrawCount,
            MoveCount: spec.MoveCount,
            DestinationIndex: spec.DestinationIndex,
            DeckPlacement: spec.DeckPlacement.HasValue ? SplitPascalCase(spec.DeckPlacement.Value.ToString()) : null,
            MultiCardOrdering: spec.MultiCardOrdering.HasValue ? SplitPascalCase(spec.MultiCardOrdering.Value.ToString()) : null,
            AllowCrossPlayer: spec.AllowCrossPlayer,
            DestinationPlayerRange: SplitPascalCase(spec.DestinationPlayerRange.ToString()));
    }

    private static CardCatalogEffectExecutionConditionResponse? ToExecutionConditionResponse(EffectExecutionConditionSpec? condition)
    {
        if (condition is null)
        {
            return null;
        }

        return new CardCatalogEffectExecutionConditionResponse(
            ArgumentKey: condition.ArgumentKey.ToWireValue(),
            ExpectedValue: condition.ExpectedValue,
            IgnoreCase: condition.IgnoreCase,
            Negate: condition.Negate);
    }

    private static ZoneCardRestrictionRuleSet? ResolveRevealPostConditionRuleSet(EffectSpec effect)
    {
        if (effect.RevealPostConditionRuleSet is not null)
        {
            return effect.RevealPostConditionRuleSet;
        }

        var restriction = ResolveRevealPostConditionRestriction(effect);
        if (restriction is null)
        {
            return null;
        }

        return new ZoneCardRestrictionRuleSet
        {
            Operator = RequirementGroupOperator.All,
            Restrictions =
            [
                restriction,
            ],
        };
    }

    private static ZoneCardRestriction? ResolveRevealPostConditionRestriction(EffectSpec effect)
    {
        if (effect.RevealPostConditionRuleSet?.Restrictions is { Count: > 0 })
        {
            return effect.RevealPostConditionRuleSet.Restrictions[0];
        }

        if (effect.RevealPostConditionRestriction is not null)
        {
            return effect.RevealPostConditionRestriction;
        }

        if (effect.RevealPostConditionPredicate is null)
        {
            return null;
        }

        return new ZoneCardRestriction
        {
            MatchMode = ZoneRestrictionMatchMode.All,
            Predicates =
            [
                effect.RevealPostConditionPredicate,
            ],
        };
    }

    private static ZoneCardPropertyPredicate? ResolveRevealPostConditionPredicate(EffectSpec effect)
    {
        return effect.RevealPostConditionPredicate
            ?? effect.RevealPostConditionRestriction?.Predicates?.FirstOrDefault();
    }

    private static CardCatalogZoneCardRestrictionResponse? ToNullableZoneCardRestrictionResponse(ZoneCardRestriction? restriction)
    {
        return restriction is null ? null : ToZoneCardRestrictionResponse(restriction);
    }

    private static CardCatalogZoneCardRestrictionRuleSetResponse? ToNullableZoneCardRestrictionRuleSetResponse(ZoneCardRestrictionRuleSet? ruleSet)
    {
        if (ruleSet is null)
        {
            return null;
        }

        return new CardCatalogZoneCardRestrictionRuleSetResponse(
            Restrictions: ruleSet.Restrictions.Select(ToZoneCardRestrictionResponse).ToList(),
            Operator: SplitPascalCase(ruleSet.Operator.ToString()));
    }

            private static CardCatalogZoneCardPropertyPredicateResponse? ToNullableZoneCardPropertyPredicateResponse(ZoneCardPropertyPredicate? predicate)
    {
        if (predicate is null)
        {
            return null;
        }

        return new CardCatalogZoneCardPropertyPredicateResponse(
            Property: SplitPascalCase(predicate.Property.ToString()),
            Operator: SplitPascalCase(predicate.Operator.ToString()),
            Value: predicate.Value,
            Values: predicate.Values ?? [],
            IgnoreCase: predicate.IgnoreCase);
    }

    private static CardCatalogPassiveReevaluationResponse? ToPassiveReevaluationResponse(PassiveReevaluationSpec? spec)
    {
        if (spec is null)
        {
            return null;
        }

        return new CardCatalogPassiveReevaluationResponse(
            TriggerKinds: spec.TriggerKinds.Select(kind => SplitPascalCase(kind.ToString())).ToList(),
            Scope: SplitPascalCase(spec.Scope.ToString()));
    }

    private static CardCatalogPassiveConsequenceResponse ToPassiveConsequenceResponse(PassiveConsequenceSpec spec)
    {
        return new CardCatalogPassiveConsequenceResponse(
            ConsequenceEffectTypeKey: spec.ConsequenceEffectTypeKey,
            TargetPolicy: SplitPascalCase(spec.TargetPolicy.ToString()),
            ConsequenceArguments: spec.ConsequenceArguments is null
                ? new Dictionary<string, string>(StringComparer.Ordinal)
                : new Dictionary<string, string>(spec.ConsequenceArguments, StringComparer.Ordinal));
    }

    private static CardCatalogKeywordModificationResponse ToKeywordModificationResponse(KeywordModificationSpec spec)
    {
        return new CardCatalogKeywordModificationResponse(
            TargetType: SplitPascalCase(spec.TargetType.ToString()),
            Operation: SplitPascalCase(spec.Operation.ToString()),
            Keyword: spec.Keyword);
    }

    private static CardCatalogEffectContextRuleSetResponse ToContextRuleResponse(EffectContextRuleSet rule)
    {
        return new CardCatalogEffectContextRuleSetResponse(
            Player: ToContextConditionResponse(rule.Player),
            Opponent: ToContextConditionResponse(rule.Opponent));
    }

    private static CardCatalogEffectContextConditionResponse? ToContextConditionResponse(EffectContextCondition? condition)
    {
        if (condition is null)
        {
            return null;
        }

        return new CardCatalogEffectContextConditionResponse(
            InZone: condition.InZone.HasValue ? SplitPascalCase(condition.InZone.Value.ToString()) : null,
            InZoneRequirements: ToZoneRequirementSetResponse(condition.InZoneRequirements));
    }

    private static CardCatalogZoneRequirementSetResponse? ToZoneRequirementSetResponse(ZoneRequirementSet? requirementSet)
    {
        if (requirementSet is null)
        {
            return null;
        }

        return new CardCatalogZoneRequirementSetResponse(
            Requirements: requirementSet.Requirements
                .Select(ToZoneAmountRequirementResponse)
                .ToList(),
            Operator: SplitPascalCase(requirementSet.Operator.ToString()),
            DistinctCardsAcrossRequirements: requirementSet.DistinctCardsAcrossRequirements);
    }

    private static CardCatalogZoneAmountRequirementResponse ToZoneAmountRequirementResponse(ZoneAmountRequirement requirement)
    {
        return new CardCatalogZoneAmountRequirementResponse(
            Amount: requirement.Amount,
            Comparison: SplitPascalCase(requirement.Comparison.ToString()),
            Restriction: ToZoneCardRestrictionResponse(requirement.Restriction));
    }

    private static CardCatalogEffectTargetRuleSetResponse ToTargetRuleSetResponse(EffectTargetRuleSet ruleSet)
    {
        return new CardCatalogEffectTargetRuleSetResponse(
            Operator: SplitPascalCase(ruleSet.Operator.ToString()),
            ExactTargetCount: ruleSet.ExactTargetCount,
            MinimumTargetCount: ruleSet.MinimumTargetCount,
            MaximumTargetCount: ruleSet.MaximumTargetCount,
            AutoSelectAllValidTargets: ruleSet.AutoSelectAllValidTargets,
            TributeComposition: ToTributeTargetCompositionResponse(ruleSet.TributeComposition),
            Rules: ruleSet.Rules
                .Select(ToTargetRuleResponse)
                .ToList());
    }

    private static CardCatalogEffectTargetRuleResponse ToTargetRuleResponse(EffectTargetRule rule)
    {
        return new CardCatalogEffectTargetRuleResponse(
            Scope: SplitPascalCase(rule.Scope.ToString()),
            InZone: SplitPascalCase(rule.InZone.ToString()),
            LocationSelector: ToTargetLocationSelectorResponse(rule.LocationSelector),
            TributeRole: rule.TributeRole.HasValue ? SplitPascalCase(rule.TributeRole.Value.ToString()) : null,
            ExactSelectedTargetCount: rule.ExactSelectedTargetCount,
            MinimumSelectedTargetCount: rule.MinimumSelectedTargetCount,
            MaximumSelectedTargetCount: rule.MaximumSelectedTargetCount,
            Restriction: ToZoneCardRestrictionResponse(rule.Restriction));
    }

    private static CardCatalogEffectTargetLocationSelectorResponse ToTargetLocationSelectorResponse(EffectTargetLocationSelector selector)
    {
        selector ??= new EffectTargetLocationSelector();

        return new CardCatalogEffectTargetLocationSelectorResponse(
            Kind: SplitPascalCase(selector.Kind.ToString()),
            SupportSlotIndex: selector.SupportSlotIndex);
    }

    private static CardCatalogZoneCardRestrictionResponse ToZoneCardRestrictionResponse(ZoneCardRestriction restriction)
    {
        return new CardCatalogZoneCardRestrictionResponse(
            Predicates: (restriction.Predicates ?? [])
                .Select(ToZoneCardPropertyPredicateResponse)
                .ToList(),
            MatchMode: SplitPascalCase(restriction.MatchMode.ToString()));
    }

    private static CardCatalogZoneCardPropertyPredicateResponse ToZoneCardPropertyPredicateResponse(ZoneCardPropertyPredicate predicate)
    {
        return new CardCatalogZoneCardPropertyPredicateResponse(
            Property: SplitPascalCase(predicate.Property.ToString()),
            Operator: SplitPascalCase(predicate.Operator.ToString()),
            Value: predicate.Value,
            Values: predicate.Values ?? [],
            IgnoreCase: predicate.IgnoreCase);
    }

    private static CardCatalogTributeTargetCompositionResponse? ToTributeTargetCompositionResponse(TributeTargetComposition? composition)
    {
        if (composition is null)
        {
            return null;
        }

        return new CardCatalogTributeTargetCompositionResponse(
            ExactTributeCount: composition.ExactTributeCount,
            MinimumTributeCount: composition.MinimumTributeCount,
            MaximumTributeCount: composition.MaximumTributeCount,
            RequireSingleSummonTarget: composition.RequireSingleSummonTarget,
            RequireDistinctSummonAndTributes: composition.RequireDistinctSummonAndTributes);
    }

    private static string SplitPascalCase(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var builder = new StringBuilder(value.Length + 8);
        builder.Append(value[0]);

        for (var index = 1; index < value.Length; index++)
        {
            var current = value[index];
            var previous = value[index - 1];
            var hasNext = index + 1 < value.Length;
            var next = hasNext ? value[index + 1] : '\0';

            if (char.IsUpper(current) &&
                    (char.IsLower(previous) || (hasNext && char.IsLower(next))))
            {
                builder.Append(' ');
            }

            builder.Append(current);
        }

        return builder.ToString();
    }

    private async Task<ErrorOr<List<DeckCard>>> ResolveDeckCardsAsync(IReadOnlyList<DeckCardRequest>? requestedCards)
    {
        var normalizedCards = (requestedCards ?? [])
            .Where(card => !string.IsNullOrWhiteSpace(card.CardId))
            .GroupBy(card => card.CardId.Trim().ToUpperInvariant(), StringComparer.Ordinal)
            .Select(group => new DeckRuleCard(group.Key, group.Sum(card => card.Quantity)))
            .ToList();

        if (normalizedCards.Count == 0)
        {
            return Error.Validation(
                    code: "Deck.Cards.Empty",
                    description: "A deck needs at least one card.");
        }

        var requestedCardIds = normalizedCards
            .Select(card => card.CardId)
            .ToHashSet(StringComparer.Ordinal);

        var catalogEntries = await dbContext.CardCatalogEntries
            .AsNoTracking()
            .Where(entry => requestedCardIds.Contains(entry.CardId.ToUpper()))
            .Select(entry => new { entry.Id, entry.CardId, entry.Type, entry.Color })
            .ToListAsync();

        var metadataByCardId = catalogEntries.ToDictionary(
            keySelector: entry => entry.CardId.Trim().ToUpperInvariant(),
            elementSelector: entry => new DeckRuleCardMetadata(entry.CardId, entry.Type, entry.Color),
            comparer: StringComparer.Ordinal);

        var activeRulesets = await LoadActiveRulesetDefinitionsAsync();
        var rulesetValidation = DeckRulesetRules.Evaluate(normalizedCards, metadataByCardId, activeRulesets);
        if (!rulesetValidation.IsLegalInAnyRuleset)
        {
            return ToRulesetErrors(rulesetValidation);
        }

        var catalogEntryIdByCardId = catalogEntries.ToDictionary(
            keySelector: entry => entry.CardId.Trim().ToUpperInvariant(),
            elementSelector: entry => entry.Id,
            comparer: StringComparer.Ordinal);

        return normalizedCards
            .Select(card => new DeckCard
            {
                CardCatalogEntryId = catalogEntryIdByCardId[card.CardId],
                Quantity = card.Quantity,
            })
            .ToList();
    }

    private async Task<List<DeckRulesetDefinition>> LoadActiveRulesetDefinitionsAsync()
    {
        var rulesets = await dbContext.DeckRulesets
            .AsNoTracking()
            .Where(ruleset => ruleset.IsActive)
            .Include(ruleset => ruleset.CardRestrictions)
            .ThenInclude(restriction => restriction.CardCatalogEntry)
            .OrderBy(ruleset => ruleset.SortOrder)
            .ThenBy(ruleset => ruleset.Name)
            .ToListAsync();

        return rulesets
            .Select(ruleset => new DeckRulesetDefinition(
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
                MaxCopiesByCardId: ruleset.CardRestrictions.ToDictionary(
                    restriction => restriction.CardCatalogEntry.CardId.Trim().ToUpperInvariant(),
                    restriction => restriction.MaxCopies,
                    comparer: StringComparer.Ordinal),
                // Deck validation never reads the clock, but the definition is the single shape a ruleset is
                // projected into, so it carries the policy rather than leaving an implicit untimed default.
                Clock: GameClockPolicy.FromSeconds(
                    enabled: ruleset.ClockEnabled,
                    mainPhaseSeconds: ruleset.MainPhaseSeconds,
                    otherPhaseSeconds: ruleset.OtherPhaseSeconds,
                    playerPoolSeconds: ruleset.PlayerPoolSeconds,
                    timeoutsBeforeForfeit: ruleset.TimeoutsBeforeForfeit)))
            .ToList();
    }

    private static List<Error> ToRulesetErrors(DeckRulesetValidation validation)
    {
        if (validation.Evaluations.Count == 0)
        {
            return
            [
                Error.Validation(
                    code: "Deck.Ruleset.NoActiveRulesets",
                    description: "No active deck rulesets are configured, so the deck cannot be validated.")
            ];
        }

        var summaries = validation.Evaluations
            .Select(evaluation => $"{evaluation.Name}: "
                + string.Join(" ", evaluation.Violations.Select(violation => violation.Description.Trim())));

        return
        [
            Error.Validation(
                code: "Deck.Ruleset.NotLegalInAnyRuleset",
                description: "This deck is not legal in any active ruleset. " + string.Join(" ", summaries))
        ];
    }

    private static ErrorOr<List<ParsedDeckCard>> ParseCards(string cardsPayload)
    {
        var quantitiesByCardId = new Dictionary<string, int>(StringComparer.Ordinal);
        var lines = cardsPayload.Split('\n');

        for (var lineIndex = 0; lineIndex < lines.Length; lineIndex++)
        {
            var rawLine = lines[lineIndex].TrimEnd('\r');
            var commentIndex = rawLine.IndexOf("//", StringComparison.Ordinal);
            var line = (commentIndex >= 0 ? rawLine[..commentIndex] : rawLine).Trim();

            if (line.Length == 0)
            {
                continue;
            }

            var match = DeckLinePattern().Match(line);

            if (!match.Success)
            {
                return Error.Validation(
                        code: "Deck.Create.InvalidCardsFormat",
                        description: $"Line {lineIndex + 1} is invalid. Expected format '<quantity>x <cardId>'.");
            }

            if (!int.TryParse(match.Groups[1].Value, out var quantity) || quantity <= 0)
            {
                return Error.Validation(
                        code: "Deck.Create.InvalidQuantity",
                        description: $"Line {lineIndex + 1} has an invalid quantity.");
            }

            var cardId = match.Groups[2].Value.ToUpperInvariant();
            quantitiesByCardId.TryGetValue(cardId, out var existingQuantity);
            quantitiesByCardId[cardId] = existingQuantity + quantity;
        }

        return quantitiesByCardId
                .Select(pair => new ParsedDeckCard(pair.Key, pair.Value))
                .ToList();
    }

    private sealed record LegacyConditionSpec(string Id);

}