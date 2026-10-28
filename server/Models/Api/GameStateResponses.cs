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
    GameOutcomeResponse? GameOutcome = null,
    // The transition the engine performed itself and stopped on, waiting for every connected participant to
    // acknowledge that their client finished presenting it. Null while nothing is outstanding - the engine may
    // take the next phase step and the players may act. See PendingPhasePresentation.
    PhasePresentationResponse? PendingPresentation = null,
    // The card movements the engine performed, oldest first, as a bounded tail. The client de-duplicates by
    // AnimationEventResponse.EventId and animates the ones it has not seen yet, so a move is drawn because the
    // engine said it happened rather than because a zone count changed (see CardMovementRecord).
    IReadOnlyList<AnimationEventResponse>? AnimationEvents = null,
    // The deck ruleset this game plays under, or null for a game created outside matchmaking. The board names
    // the format from this, and it is the reason a join-by-code can be refused.
    GameRulesetBindingResponse? Ruleset = null,
    // The action clock: who is being waited on, when their stop expires, and what is left of each player's pool.
    // Null for a game whose clock has not been created yet and once the game is over; a table hosted as "time
    // relaxed" publishes it with IsEnabled = false instead, so the clients can tell untimed-by-design from unstarted.
    GameClockResponse? Clock = null,
    // The host-only table rules this game runs with (see GameModifierKeys), or null for a plain table. Always null
    // for a quick-match game. The board names them so a joiner is told the table is untimed instead of inferring it
    // from a missing countdown.
    IReadOnlyList<string>? Modifiers = null,
    // The tail of the game's action log, oldest first, already filtered for the requesting player. This is the
    // player-facing record of what happened (see ActionLogEntryResponse and GameActionLogPublishing); the engine
    // keeps the full, unfiltered log for auditing.
    IReadOnlyList<ActionLogEntryResponse>? ActionLog = null,
    // A player asked to take a move back and the table is frozen until the other player answers. Both clients
    // render it: the requester waits, the approver accepts or declines.
    RedoRequestResponse? PendingRedo = null,
    // The request whose approval moved the board. When it changes the client paints the payload instead of
    // animating the difference between the two boards.
    string? LastRewindId = null,
    // True when asking for a redo would actually go somewhere, so the control is offered only while it can do
    // something.
    bool CanRequestRedo = false);

/// <summary>
/// A redo waiting for the other player's answer. It is not a prompt: the whole table is frozen while it is set, and
/// the only way out is acceptance, refusal, a withdrawal or the response timeout.
/// </summary>
public sealed record RedoRequestResponse(
    string RequestId,
    string RequestedByPlayerId,
    string ApproverPlayerId,
    int TurnNumber,
    string Phase);

/// <summary>
/// The action clock as a client renders it. <see cref="DeadlineUtc"/> is absolute on purpose: the client counts
/// down toward it locally and re-syncs on every push, so a reload or a slow frame cannot drift the displayed time
/// away from the engine's. <see cref="ServerNowUtc"/> is the server's own reading at mapping time, which lets a
/// client correct for clock skew instead of trusting its own clock.
/// </summary>
public sealed record GameClockResponse(
    bool IsEnabled,
    string? OwningPlayerId,
    string StopKind,
    string? DeadlineUtc,
    string ServerNowUtc,
    int? SecondsRemainingInStop,
    IReadOnlyList<GameClockPlayerResponse> Players);

/// <summary>One player's side of the clock: what is left of their pool and how close they are to forfeiting.</summary>
public sealed record GameClockPlayerResponse(
    string PlayerId,
    int SecondsRemainingInPool,
    int ConsecutiveTimeouts,
    int TimeoutsBeforeForfeit);

/// <summary>The format a quick-match game was created under.</summary>
public sealed record GameRulesetBindingResponse(string Id, string Key, string Name);

/// <summary>
/// A phase transition waiting to be presented. It is deliberately not a prompt: nothing is being asked, the only
/// answer is "my board finished animating", and it must never reach the prompt UI or the action list.
/// </summary>
public sealed record PhasePresentationResponse(
    string PresentationId,
    string Phase,
    string Kind,
    int TurnNumber,
    IReadOnlyList<string> RequiredAckPlayerIds,
    IReadOnlyList<string> AcknowledgedPlayerIds);

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
/// One published line of the game's action log. <see cref="Sequence"/> is the entry's position in the game's own
/// log, so the client can order and de-duplicate entries without trusting timestamps or list indices; the rest is
/// the shape the log panel renders, lifted out of the entry's metadata so the client never has to parse
/// <see cref="Message"/>.
///
/// <see cref="Message"/> is a development aid, not a shipping path: it is the server's audit sentence, so it may name
/// players by id, and it is published as null whenever it carries an identifier (see
/// <c>GameStateResponseMapper.SanitizePublishedMessage</c>). The client phrases every known action type itself and
/// shows a neutral line otherwise, so nothing player-facing depends on this field.
/// </summary>
public sealed record ActionLogEntryResponse(
    string EntryId,
    int Sequence,
    string TimestampUtc,
    string ActionType,
    string Category,
    string? PlayerId,
    string? CardInstanceId,
    string? CardDefinitionId,
    string? DisplayName,
    string? TargetInstanceId,
    string? TargetDisplayName,
    string? Phase,
    int? TurnNumber,
    // Whose turn this entry happened in, and which of that player's own turns it was. The global turn number counts
    // every player's turn in sequence, so only this pair can group "all of your turn 4, then all of theirs".
    string? ActivePlayerId,
    int? TurnOwnerTurnCount,
    // For a resolved prompt: which kind of prompt it was and what was answered, so the client can say what happened
    // instead of "a prompt was answered". All null for entries that are not prompt resolutions.
    string? PromptType,
    string? SelectionPromptKind,
    string? SelectedOption,
    // True when the engine answered on the player's behalf because their clock ran out: the entry keeps the player,
    // the client must not phrase it as their decision.
    bool? ResolvedByTimeout,
    string? Message);

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

/// <summary>
/// One card movement, projected from the engine's recorded movements (see <see cref="CardMovementRecord"/>).
/// Unlike an effect notice, a movement is published for every player: a card moving is visible on both boards.
/// </summary>
public sealed record AnimationEventResponse(
    string EventId,
    string Kind,
    string CardInstanceId,
    string PlayerId,
    string? FromZone,
    string? ToZone);

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

/// <summary>
/// One status a card is under. <see cref="Kind"/> is a <see cref="CardStatusEffectCodes"/> value. The reason
/// fields are only filled for the cannot-attack status, and they exist because the opponent's board receives
/// no card actions at all - without them that client could never explain why the card cannot attack.
/// </summary>
public sealed record CardStatusEffectResponse(
    string Kind,
    string? ReasonCode = null,
    string? Reason = null);

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

    /// <summary>
    /// The statuses this card is under right now (<see cref="CardStatusEffectCodes"/>). Computed by the mapper
    /// from the engine's effective keywords and suppression state, because the client cannot infer them: a
    /// printed "Rush" is void while the card's effects are suppressed, and keyword grants live in the engine.
    /// Only battlefield cards and leaders carry statuses; hidden zones stay empty so nothing leaks.
    /// </summary>
    public IReadOnlyList<CardStatusEffectResponse> StatusEffects { get; init; } = [];
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