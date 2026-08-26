namespace ProjectHiddenVillage.Server.Api.Services.Games;

internal static class CardRuntimeEffectStateService
{
    public sealed record TemporaryEffectProjection(
        string EffectId,
        string SourceCardInstanceId,
        string TargetCardInstanceId,
        string ModifierKind,
        string DurationMode,
        string? Attribute,
        string? Operation,
        int? Value,
        string? Keyword,
        string? FaceStateTargetCategory,
        string? TargetPlayerId,
        int AppliedTurnNumber);

    public static int ResolveEffectivePower(GameState state, CardInstance cardInstance, Card cardDefinition)
    {
        var baseValue = cardInstance.PowerOverride ?? cardDefinition.Power;
        return ApplyActiveAttributeEffects(state, cardInstance, baseValue, EffectAttributeType.CardPower);
    }

    public static int ResolveEffectiveDamage(GameState state, CardInstance cardInstance, Card cardDefinition)
    {
        var baseValue = cardInstance.DamageOverride ?? cardDefinition.Damage;
        return ApplyActiveAttributeEffects(state, cardInstance, baseValue, EffectAttributeType.CardDamage);
    }

    public static int ResolveEffectiveHealth(GameState state, CardInstance cardInstance, Card cardDefinition)
    {
        var definitionHealth = cardDefinition is CharacterCard character ? character.Health : 0;
        var baseValue = cardInstance.HealthOverride ?? definitionHealth;
        return ApplyActiveAttributeEffects(state, cardInstance, baseValue, EffectAttributeType.CardHealth);
    }

    public static IReadOnlyList<string> ResolveEffectiveKeywords(GameState state, CardInstance cardInstance)
    {
        var keywords = new List<string>(cardInstance.RuntimeKeywords);

        foreach (var appliedEffect in GetActiveCardEffects(state, cardInstance.InstanceId)
                     .Where(effect => effect.ModifierKind == AppliedCardModifierKind.Keyword))
        {
            if (string.IsNullOrWhiteSpace(appliedEffect.Keyword) || !appliedEffect.KeywordOperation.HasValue)
            {
                continue;
            }

            ApplyKeywordOperation(keywords, appliedEffect.Keyword.Trim(), appliedEffect.KeywordOperation.Value);
        }

        return keywords;
    }

    public static int ResolveEffectiveLeaderPower(GameState state, LeaderCardInstanceState leader)
    {
        return ApplyActiveLeaderAttributeEffects(state, leader, leader.Power, EffectAttributeType.LeaderPower);
    }

    public static int ResolveEffectiveLeaderDamage(GameState state, LeaderCardInstanceState leader)
    {
        return ApplyActiveLeaderAttributeEffects(state, leader, leader.Damage, EffectAttributeType.LeaderDamage);
    }

    public static int ResolveEffectiveLeaderCurrentLife(GameState state, LeaderCardInstanceState leader)
    {
        var value = ApplyActiveLeaderAttributeEffects(state, leader, leader.CurrentLife, EffectAttributeType.LeaderCurrentLife);
        return Math.Min(value, leader.TotalLife);
    }

    public static IReadOnlyList<TemporaryEffectProjection> BuildTemporaryEffectProjections(GameState state)
    {
        return state.AppliedCardEffects
            .Where(effect => effect.DurationMode is EffectDurationMode.DuringThisTurn or EffectDurationMode.DuringOpponentNextTurn or EffectDurationMode.DuringThisBattle)
            .Select(effect => new TemporaryEffectProjection(
                EffectId: effect.EffectSpecId,
                SourceCardInstanceId: effect.SourceCardInstanceId,
                TargetCardInstanceId: effect.TargetCardInstanceId,
                ModifierKind: effect.ModifierKind.ToString(),
                DurationMode: effect.DurationMode.ToString(),
                Attribute: effect.AttributeType?.ToString(),
                Operation: effect.AttributeOperation?.ToString() ?? effect.KeywordOperation?.ToString(),
                Value: effect.AttributeValue,
                Keyword: effect.Keyword,
                FaceStateTargetCategory: effect.FaceStateTargetCategory?.ToString(),
                TargetPlayerId: effect.TargetPlayerId,
                AppliedTurnNumber: effect.AppliedTurnNumber))
            .ToList();
    }

    public static bool IsDurationSupportedForAttributes(EffectDurationMode durationMode)
    {
        return durationMode == EffectDurationMode.DuringThisTurn
            || durationMode == EffectDurationMode.DuringOpponentNextTurn
            || durationMode == EffectDurationMode.DuringThisBattle;
    }

    public static bool IsDurationSupportedForKeywords(EffectDurationMode durationMode)
    {
        return durationMode == EffectDurationMode.DuringThisTurn
            || durationMode == EffectDurationMode.DuringOpponentNextTurn
            || durationMode == EffectDurationMode.DuringThisBattle;
    }

    public static bool IsDurationSupportedForFaceStateLocks(EffectDurationMode durationMode)
    {
        return durationMode == EffectDurationMode.DuringThisTurn
            || durationMode == EffectDurationMode.DuringOpponentNextTurn
            || durationMode == EffectDurationMode.DuringThisBattle;
    }

    public static void AddTemporaryAttributeEffect(
        GameState state,
        CardInstance sourceCardInstance,
        CardInstance targetCardInstance,
        string effectSpecId,
        AttributeModificationSpec modification,
        EffectDurationMode durationMode)
    {
        state.AppliedCardEffects.Add(new AppliedCardEffectState
        {
            SourceCardInstanceId = sourceCardInstance.InstanceId,
            EffectSpecId = effectSpecId,
            TargetCardInstanceId = targetCardInstance.InstanceId,
            ModifierKind = AppliedCardModifierKind.Attribute,
            DurationMode = durationMode,
            AttributeType = modification.Attribute,
            AttributeOperation = modification.Operation,
            AttributeValue = modification.Value,
            AttributeMinimumValue = modification.MinimumValue,
            AttributeMaximumValue = modification.MaximumValue,
            AppliedTurnNumber = state.TurnNumber,
        });
    }

    public static void AddTemporaryLeaderAttributeEffect(
        GameState state,
        CardInstance sourceCardInstance,
        LeaderCardInstanceState targetLeader,
        string effectSpecId,
        AttributeModificationSpec modification,
        EffectDurationMode durationMode)
    {
        state.AppliedCardEffects.Add(new AppliedCardEffectState
        {
            SourceCardInstanceId = sourceCardInstance.InstanceId,
            EffectSpecId = effectSpecId,
            TargetCardInstanceId = targetLeader.InstanceId,
            ModifierKind = AppliedCardModifierKind.Attribute,
            DurationMode = durationMode,
            AttributeType = modification.Attribute,
            AttributeOperation = modification.Operation,
            AttributeValue = modification.Value,
            AttributeMinimumValue = modification.MinimumValue,
            AttributeMaximumValue = modification.MaximumValue,
            AppliedTurnNumber = state.TurnNumber,
        });
    }

    public static void AddTemporaryKeywordEffect(
        GameState state,
        CardInstance sourceCardInstance,
        CardInstance targetCardInstance,
        string effectSpecId,
        KeywordModificationSpec modification,
        EffectDurationMode durationMode)
    {
        state.AppliedCardEffects.Add(new AppliedCardEffectState
        {
            SourceCardInstanceId = sourceCardInstance.InstanceId,
            EffectSpecId = effectSpecId,
            TargetCardInstanceId = targetCardInstance.InstanceId,
            ModifierKind = AppliedCardModifierKind.Keyword,
            DurationMode = durationMode,
            KeywordOperation = modification.Operation,
            Keyword = modification.Keyword,
            AppliedTurnNumber = state.TurnNumber,
        });
    }

    public static void AddTemporaryFaceStateLockEffect(
        GameState state,
        CardInstance sourceCardInstance,
        string effectSpecId,
        FaceStateTargetCategory targetCategory,
        FaceStateLockOperation operation,
        string targetPlayerId,
        EffectDurationMode durationMode)
    {
        state.AppliedCardEffects.Add(new AppliedCardEffectState
        {
            SourceCardInstanceId = sourceCardInstance.InstanceId,
            EffectSpecId = effectSpecId,
            TargetCardInstanceId = string.Empty,
            ModifierKind = AppliedCardModifierKind.FaceStateLock,
            DurationMode = durationMode,
            FaceStateTargetCategory = targetCategory,
            FaceStateLockOperation = operation,
            TargetPlayerId = targetPlayerId,
            AppliedTurnNumber = state.TurnNumber,
        });
    }

    public static bool IsFaceUpTransitionBlocked(
        GameState state,
        string targetPlayerId,
        FaceStateTargetCategory targetCategory)
    {
        return state.AppliedCardEffects.Any(effect =>
            effect.ModifierKind == AppliedCardModifierKind.FaceStateLock
            && effect.FaceStateLockOperation == FaceStateLockOperation.CannotTurnFaceUp
            && effect.FaceStateTargetCategory == targetCategory
            && string.Equals(effect.TargetPlayerId, targetPlayerId, StringComparison.Ordinal)
            && effect.DurationMode is EffectDurationMode.DuringThisTurn
                or EffectDurationMode.DuringOpponentNextTurn
                or EffectDurationMode.DuringThisBattle);
    }

    private static int ApplyActiveAttributeEffects(
        GameState state,
        CardInstance cardInstance,
        int startValue,
        EffectAttributeType attributeType)
    {
        var value = startValue;

        foreach (var appliedEffect in GetActiveCardEffects(state, cardInstance.InstanceId)
                     .Where(effect => effect.ModifierKind == AppliedCardModifierKind.Attribute
                         && effect.AttributeType == attributeType
                         && effect.AttributeOperation.HasValue
                         && effect.AttributeValue.HasValue))
        {
            value = ApplyOperation(value, appliedEffect.AttributeOperation!.Value, appliedEffect.AttributeValue!.Value);
            value = Clamp(value, appliedEffect.AttributeMinimumValue, appliedEffect.AttributeMaximumValue, defaultMin: 0);
        }

        return value;
    }

    private static int ApplyActiveLeaderAttributeEffects(
        GameState state,
        LeaderCardInstanceState leader,
        int startValue,
        EffectAttributeType attributeType)
    {
        var value = startValue;

        foreach (var appliedEffect in GetActiveCardEffects(state, leader.InstanceId)
                     .Where(effect => effect.ModifierKind == AppliedCardModifierKind.Attribute
                         && effect.AttributeType == attributeType
                         && effect.AttributeOperation.HasValue
                         && effect.AttributeValue.HasValue))
        {
            value = ApplyOperation(value, appliedEffect.AttributeOperation!.Value, appliedEffect.AttributeValue!.Value);
            value = Clamp(value, appliedEffect.AttributeMinimumValue, appliedEffect.AttributeMaximumValue, defaultMin: 0);
        }

        return value;
    }

    private static IEnumerable<AppliedCardEffectState> GetActiveCardEffects(GameState state, string targetCardInstanceId)
    {
        return state.AppliedCardEffects
            .Where(effect => string.Equals(effect.TargetCardInstanceId, targetCardInstanceId, StringComparison.Ordinal)
                && effect.DurationMode is EffectDurationMode.DuringThisTurn or EffectDurationMode.DuringOpponentNextTurn or EffectDurationMode.DuringThisBattle);
    }

    private static int ApplyOperation(int currentValue, AttributeModificationOperation operation, int operand)
    {
        return operation switch
        {
            AttributeModificationOperation.Add => currentValue + operand,
            AttributeModificationOperation.Subtract => currentValue - operand,
            AttributeModificationOperation.Multiply => currentValue * operand,
            AttributeModificationOperation.Set => operand,
            _ => currentValue
        };
    }

    private static int Clamp(int value, int? minimumValue, int? maximumValue, int defaultMin)
    {
        var min = minimumValue ?? defaultMin;
        var max = maximumValue;
        var clamped = Math.Max(min, value);
        return max.HasValue ? Math.Min(clamped, max.Value) : clamped;
    }

    private static void ApplyKeywordOperation(List<string> runtimeKeywords, string keyword, KeywordModificationOperation operation)
    {
        if (operation == KeywordModificationOperation.Remove)
        {
            runtimeKeywords.RemoveAll(existing => string.Equals(existing, keyword, StringComparison.OrdinalIgnoreCase));
            return;
        }

        if (!runtimeKeywords.Any(existing => string.Equals(existing, keyword, StringComparison.OrdinalIgnoreCase)))
        {
            runtimeKeywords.Add(keyword);
        }
    }
}
