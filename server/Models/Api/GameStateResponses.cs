namespace ProjectHiddenVillage.Server;

public sealed record GameStateResponse(
    string GameId,
    int TurnNumber,
    string ActivePlayerId,
    string PriorityPlayerId,
    string Phase,
    PendingPromptResponse? PendingPrompt,
    IReadOnlyList<GameActionOptionResponse> AvailableActions,
    IReadOnlyList<ActiveTemporaryEffectResponse> ActiveTemporaryEffects,
    IReadOnlyList<PlayerZonesResponse> Players);

public sealed record ActiveTemporaryEffectResponse(
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

public sealed record PendingPromptResponse(
    string PromptId,
    string Type,
    bool IsAwaitingRequestingPlayer,
    IReadOnlyList<string> Options);

public sealed record GameActionOptionResponse(
    string ActionId,
    string Label,
    bool IsEnabled,
    string? DisabledReason = null);

public sealed record PlayerZonesResponse(
    string PlayerId,
    int TurnCount,
    bool IsSummonCardReady,
    LeaderCardInstanceResponse Leader,
    IReadOnlyList<CardInstanceResponse> Deck,
    int DeckCount,
    IReadOnlyList<CardInstanceResponse> Hand,
    int HandCount,
    IReadOnlyList<CardInstanceResponse> CharacterField,
    IReadOnlyList<CardInstanceResponse> SupportZone,
    IReadOnlyList<CardInstanceResponse> Trash,
    IReadOnlyList<CardInstanceResponse> ExileZone);

public record CardInstanceResponse(
    string InstanceId,
    string CardDefinitionId,
    string OwnerPlayerId,
    string ControllerPlayerId)
{
    public bool IsFaceUp { get; init; } = true;

    public int? SupportSlotIndex { get; init; }

    public IReadOnlyList<GameActionOptionResponse> AvailableActions { get; init; } = [];
}

public sealed record LeaderCardInstanceResponse(
    string InstanceId,
    string CardDefinitionId,
    string OwnerPlayerId,
    string ControllerPlayerId,
    bool IsExhausted,
    string DisplayName,
    CardColor Color,
    IReadOnlyList<string> Traits,
    int Damage,
    int Power,
    int TotalLife,
    int CurrentLife,
    string RecoveryEffect
) : CardInstanceResponse(
    InstanceId,
    CardDefinitionId,
    OwnerPlayerId,
    ControllerPlayerId);

public sealed record EnrichedCardInstanceResponse(
    string InstanceId,
    string CardDefinitionId,
    string OwnerPlayerId,
    string ControllerPlayerId,
    bool IsExhausted,
    bool IsRested,
    string DisplayName,
    CardType Type,
    CardColor Color,
    IReadOnlyList<string> Traits,
    int Health,
    int MaxHealth,
    int Damage,
    int Power
) : CardInstanceResponse(
    InstanceId,
    CardDefinitionId,
    OwnerPlayerId,
    ControllerPlayerId);