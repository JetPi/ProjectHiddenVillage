namespace ProjectHiddenVillage.Server;

public sealed record GameStateResponse(
    string GameId,
    int TurnNumber,
    string ActivePlayerId,
    string PriorityPlayerId,
    string Phase,
    string? AttackSequenceStage,
    bool IsAttackSequencePending,
    PendingAttackVisualStateResponse? PendingAttackVisualState,
    PendingPromptResponse? PendingPrompt,
    IReadOnlyList<GameActionOptionResponse> AvailableActions,
    IReadOnlyList<ActiveTemporaryEffectResponse> ActiveTemporaryEffects,
    IReadOnlyList<PlayerZonesResponse> Players,
    // True while an activated support waits for responses in the MainPhase ([Support Activated] window).
    // The client names that window in the phase row, so it must not have to infer it from action lists.
    bool IsSupportResponseWindowOpen = false,
    // Support activations still waiting on the resolution stack, oldest first. The client renders the
    // support-chain bubble from this list (see SupportChainEntryResponse).
    IReadOnlyList<SupportChainEntryResponse>? SupportChain = null,
    // Out-of-band notices for the requesting player, oldest first: things that happened during resolution but
    // left no board change to look at, such as a prompted selection that ran out of candidates. The client shows
    // the newest unseen one as a transient toast (see EffectNoticeResponse).
    IReadOnlyList<EffectNoticeResponse>? EffectNotices = null,
    // The terminal result of the game, or null while it is still running. Set exactly once by the engine;
    // when it is present no actions are published and the clients only offer "return to main page".
    GameOutcomeResponse? GameOutcome = null);

/// <summary>
/// The result of a finished game. <see cref="WinnerPlayerId"/> is null for a draw, which only happens when
/// both players met a losing condition at the same instant and every tiebreak metric was tied.
/// </summary>
public sealed record GameOutcomeResponse(
    string? WinnerPlayerId,
    IReadOnlyList<string> LoserPlayerIds,
    string Reason,
    int TurnNumber);

/// <summary>
/// One "the effect resolved, but it had nothing to act on" notice, projected from the game's action log so the
/// log stays the single source of truth. <see cref="NoticeId"/> is the log entry id: the client de-duplicates on
/// it, because the server republishes the same list on every push.
/// </summary>
public sealed record EffectNoticeResponse(
    string NoticeId,
    string ActionType,
    string Message,
    string? PlayerId,
    string? SourceCardInstanceId,
    string? SourceCardDisplayName,
    string? SelectionPromptKind);

/// <summary>
/// One queued support activation of the current reaction chain. <see cref="Sequence"/> is the activation
/// order inside the chain, and a target with <see cref="SupportChainTargetResponse.IsChainEntry"/> set is
/// another queued activation this one answers (a [Support Activated] negate).
/// </summary>
public sealed record SupportChainEntryResponse(
    string EntryId,
    int Sequence,
    string PlayerId,
    string SourceCardInstanceId,
    string SourceCardDisplayName,
    bool IsNegated,
    IReadOnlyList<SupportChainTargetResponse> Targets);

public sealed record SupportChainTargetResponse(
    string CardInstanceId,
    string DisplayName,
    string OwnerPlayerId,
    bool IsChainEntry,
    string? ChainEntryId);

public sealed record PendingAttackVisualStateResponse(
    string AttackerCardInstanceId,
    string DefenderPlayerId,
    string DefenderCardInstanceId,
    string DefenderZone);

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
    IReadOnlyList<string> Options,
    // Effect selection prompts (GamePromptType.Effect): the copy bucket and where the candidates live, so the
    // client can render the right wording and the right card collection. Null for phase prompts.
    string? SelectionPromptKind = null,
    string? CandidateZone = null,
    int? MinimumSelection = null,
    int? MaximumSelection = null,
    // Owner of the candidate cards (the player being asked). The client resolves the collection to render from
    // CandidateZone within this player, so an effect may offer an opponent's zone as well as its own.
    string? CandidatePlayerId = null);

public sealed record GameActionOptionResponse(
    string ActionId,
    string Label,
    bool IsEnabled,
    string? DisabledReason = null);

public sealed record GameCardActionTargetsResponse(
    string ActionId,
    string SourceCardInstanceId,
    bool IsEnabled,
    string? DisabledReason,
    int? MinimumTargetCount,
    int? MaximumTargetCount,
    int? ExactTargetCount,
    bool AutoSelectAllValidTargets,
    IReadOnlyList<GameEffectTargetReference> ValidTargets,
    IReadOnlyList<GameCardActionTargetRequirementResponse>? RequirementLabels = null,
    IReadOnlyList<GameCardActionMaterialRequirementResponse>? MaterialRequirements = null);

public sealed record GameCardActionTargetRequirementResponse(
    string CardInstanceId,
    IReadOnlyList<string> RequirementLabels);

/// <summary>
/// One material a tribute summon consumes: the material label (<c>"any"</c> for an unrestricted rule)
/// and how many distinct cards of that material the requirement demands. Computed by
/// <see cref="ProjectHiddenVillage.Server.Api.Services.Games.TributeMaterialRequirementBuilder"/> so the client never infers
/// requirement sizes from the per-candidate labels.
/// </summary>
public sealed record GameCardActionMaterialRequirementResponse(
    string Label,
    int RequiredCount,
    bool IsGeneric);

public sealed record PlayerZonesResponse(
    string PlayerId,
    int TurnCount,
    bool IsSummonCardReady,
    int ResourcePool,
    LeaderCardInstanceResponse Leader,
    IReadOnlyList<CardInstanceResponse> Deck,
    int DeckCount,
    IReadOnlyList<CardInstanceResponse> Hand,
    int HandCount,
    IReadOnlyList<EnrichedCardInstanceResponse> CharacterField,
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

    /// <summary>
    /// True while this card's face is shown to both players (a reveal). Distinct from <see cref="IsFaceUp"/>,
    /// which describes the card's own face state: a deck card is always "face up" in the data model yet hidden
    /// from the opponent until a reveal makes it visible.
    /// </summary>
    public bool IsRevealed { get; init; }

    public bool IsExhausted { get; init; }

    public bool IsRested { get; init; }

    public int? SupportSlotIndex { get; init; }

    public bool IsConcealedFromOpponent { get; init; }

    public IReadOnlyList<GameActionOptionResponse> AvailableActions { get; init; } = [];
}

public sealed record LeaderCardInstanceResponse(
    string InstanceId,
    string CardDefinitionId,
    string OwnerPlayerId,
    string ControllerPlayerId,
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