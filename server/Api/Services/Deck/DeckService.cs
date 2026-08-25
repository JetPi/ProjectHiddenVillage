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

    public async Task<ErrorOr<string>> CreateDeck(CreateDeckRequest request)
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
            .Select(entry => new { entry.Id, entry.CardId, entry.Type })
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

        var prohibitedCardIds = cardCatalogEntries
            .Where(entry => entry.Type is CardType.Chakra or CardType.Summon)
            .Select(entry => entry.CardId)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(card => card, StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (prohibitedCardIds.Count > 0)
        {
            return Error.Validation(
                    code: "Deck.Create.UnsupportedCardType",
                    description: $"Decks cannot include Chakra or Summon cards: {string.Join(", ", prohibitedCardIds)}.");
        }

        var deck = new Deck
        {
            Type = request.Type,
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

    public async Task<ErrorOr<DeckResponse>> GetDeck(string deckId, bool populate = false)
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
                    .Select(ToDeckResponseExpression())
                    .SingleOrDefaultAsync();

            return deck ?? (ErrorOr<DeckResponse>)Error.NotFound(
                        code: "Deck.Get.NotFound",
                        description: $"Deck '{deckId}' was not found.");
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

        return ToDeckResponse(deckWithCards, populate: true);
    }

    public async Task<ErrorOr<List<DeckResponse>>> GetDecks(Guid? userId = null, bool populate = false)
    {
        if (!populate)
        {
            var query = dbContext.Decks.AsNoTracking();

            if (userId.HasValue)
            {
                query = query.Where(record => record.UserId == userId.Value);
            }

            return await query
                    .OrderBy(record => record.Id)
                    .Select(ToDeckResponseExpression())
                    .ToListAsync();
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

        var decks = await populatedQuery
                .OrderBy(record => record.Id)
                .ToListAsync();

        return decks.Select(deck => ToDeckResponse(deck, populate: true)).ToList();
    }

    private static System.Linq.Expressions.Expression<Func<Deck, DeckResponse>> ToDeckResponseExpression()
    {
        return deck => new DeckResponse(
                Id: deck.Id,
                Type: deck.Type.ToString(),
                UserId: deck.UserId,
                Cards: deck.Cards
                        .OrderBy(card => card.CardCatalogEntry.CardId)
                        .Select(card => new DeckCardResponse(
                                CardId: card.CardCatalogEntry.CardId,
                                Quantity: card.Quantity))
                        .ToList());
    }

    private static DeckResponse ToDeckResponse(Deck deck, bool populate)
    {
        return new DeckResponse(
                Id: deck.Id,
                Type: deck.Type.ToString(),
                UserId: deck.UserId,
                Cards: deck.Cards
                        .OrderBy(card => card.CardCatalogEntry.CardId)
                        .Select(card => new DeckCardResponse(
                                CardId: card.CardCatalogEntry.CardId,
                                Quantity: card.Quantity,
                                Card: populate ? ToCatalogResponse(card.CardCatalogEntry) : null))
                        .ToList());
    }

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
                OriginalId: entry.OriginalId,
                MainAlternate: entry.MainAlternate,
                Attribute: entry.Attribute,
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
                    MoveCardActions: effect.MoveCardActions
                        .Select(ToMoveCardActionResponse)
                        .ToList(),
                    ContextRules: effect.ContextRules
                        .Select(ToContextRuleResponse)
                        .ToList(),
                    TargetRules: ToTargetRuleSetResponse(effect.TargetRules)))
,
                Life: entry.Life,
                Health: entry.Health,
                CannotBeNormalSummoned: entry.CannotBeNormalSummoned,
                SupportName: entry.SupportName,
                SupportEffect: entry.SupportEffect,
                SupportCost: supportCost);
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
            TargetRange: SplitPascalCase(spec.TargetRange.ToString()),
            FaceState: SplitPascalCase(spec.FaceState.ToString()));
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

    private static ErrorOr<List<ParsedDeckCard>> ParseCards(string cardsPayload)
    {
        var quantitiesByCardId = new Dictionary<string, int>(StringComparer.Ordinal);
        var lines = cardsPayload.Split(['\n', '\r'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        for (var lineIndex = 0; lineIndex < lines.Length; lineIndex++)
        {
            var line = lines[lineIndex];
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