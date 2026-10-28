export type ICreateGameForUserRequest = {
  userId: string
  deckId: string
  /**
   * The format the invite is created under. When present the server binds the game to it, so anyone the code is
   * shared with is admitted only with a deck that fits the same rules.
   */
  rulesetId?: string
  /**
   * Host-only table rules, such as the untimed `time-relaxed` table. Quick match never sends these: its queue request
   * has no modifier field, which is what keeps a relaxed table out of matchmaking by construction.
   */
  modifiers?: string[]
}

export type IJoinGameAsPlayerRequest = {
  userId: string
  deckId?: string
}

export type IGameActionOptionResponse = {
  actionId: string
  label: string
  isEnabled: boolean
  disabledReason: string | null
}

/**
 * Statuses the server projects onto a card (`CardStatusEffectCodes`). Contract values: never localise them,
 * map them to wording and icons instead.
 */
export type TCardStatusEffectKind =
  | 'Rush'
  | 'CannotAttack'
  | 'ImmuneToOpponentSupportEffects'
  | 'EffectsSuppressed'

/**
 * One status a card is under. The reason fields are only filled for `CannotAttack`, and they exist because the
 * opponent's cards publish no action options: without them that side of the board could never explain the badge.
 */
export type ICardStatusEffect = {
  kind: TCardStatusEffectKind
  reasonCode?: string | null
  reason?: string | null
}

export type IActiveTemporaryEffectResponse = {
  effectId: string
  sourceCardInstanceId: string
  targetCardInstanceId: string
  modifierKind: string
  durationMode: string
  attribute: string | null
  operation: string | null
  value: number | null
  keyword: string | null
  appliedTurnNumber: number
}

export type IGameCardInstanceResponse = {
  instanceId: string
  cardDefinitionId: string
  ownerPlayerId: string
  controllerPlayerId: string
  isFaceUp: boolean
  isConcealedFromOpponent?: boolean
  isExhausted: boolean
  availableActions?: IGameActionOptionResponse[]
  statusEffects?: ICardStatusEffect[]
  isRested: boolean
  supportSlotIndex?: number | null
  isRevealed?: boolean
  displayName?: string
  type?: string
  color?: string
  traits?: string[]
  health?: number
  maxHealth?: number
  damage?: number
  power?: number
}

export type IGameLeaderCardInstanceResponse = {
  instanceId: string
  cardDefinitionId: string
  ownerPlayerId: string
  controllerPlayerId: string
  isExhausted: boolean
  isRested?: boolean
  displayName: string
  color: string
  traits: string[]
  damage: number
  power: number
  totalLife: number
  currentLife: number
  recoveryEffect: string
  availableActions?: IGameActionOptionResponse[]
  statusEffects?: ICardStatusEffect[]
}

export type IGamePlayerStateResponse = {
  playerId: string
  turnCount: number
  isSummonCardReady: boolean
  leader: IGameLeaderCardInstanceResponse
  deck: IGameCardInstanceResponse[]
  deckCount: number
  hand: IGameCardInstanceResponse[]
  handCount: number
  characterField: IGameCardInstanceResponse[]
  supportZone: IGameCardInstanceResponse[]
  trash: IGameCardInstanceResponse[]
  exileZone: IGameCardInstanceResponse[]
  resourcePool: number
}

export type IPendingPromptResponse = {
  promptId: string
  type: string
  isAwaitingRequestingPlayer: boolean
  options: string[]
  selectionPromptKind?: string | null
  candidateZone?: string | null
  candidatePlayerId?: string | null
  minimumSelection?: number | null
  maximumSelection?: number | null
}

export type IPendingAttackVisualStateResponse = {
  attackerCardInstanceId: string
  defenderPlayerId: string
  defenderCardInstanceId: string
  defenderZone: string
}

export type IAnimationEventResponse = {
  eventId: string
  kind: string
  cardInstanceId: string
  playerId: string
  fromZone: string | null
  toZone: string | null
}

export type ISupportChainTargetResponse = {
  cardInstanceId: string
  displayName: string
  ownerPlayerId: string
  isChainEntry: boolean
  chainEntryId: string | null
}

export type ISupportChainEntryResponse = {
  entryId: string
  sequence: number
  playerId: string
  sourceCardInstanceId: string
  sourceCardDisplayName: string
  isNegated: boolean
  targets: ISupportChainTargetResponse[]
}

export type IEffectNoticeResponse = {
  noticeId: string
  actionType: string
  message: string
  playerId: string | null
  sourceCardInstanceId: string | null
  sourceCardDisplayName: string | null
  selectionPromptKind: string | null
}

/**
 * One published line of the game's action log. `sequence` is the entry's position in the server's own log, so the
 * client can order the tail it receives without trusting timestamps or array indices, and `message` is only the
 * fallback wording for an `actionType` the client does not know how to phrase itself.
 */
export type IActionLogEntryResponse = {
  entryId: string
  sequence: number
  timestampUtc: string
  actionType: string
  category: string
  playerId: string | null
  cardInstanceId: string | null
  cardDefinitionId: string | null
  displayName: string | null
  targetInstanceId: string | null
  targetDisplayName: string | null
  phase: string | null
  turnNumber: number | null
  /** Whose turn this happened in, and which of that player's own turns it was. */
  activePlayerId: string | null
  turnOwnerTurnCount: number | null
  /** For a prompt resolution: the prompt's kind and what was answered. Null for everything else. */
  promptType: string | null
  selectionPromptKind: string | null
  selectedOption: string | null
  resolvedByTimeout: boolean | null
  /** Development aid only: null whenever the audit text carried an identifier. Never shown in production. */
  message: string | null
}

export type IGameOutcomeResponse = {
  winnerPlayerId: string | null
  loserPlayerIds: string[]
  reason: string
  turnNumber: number
}

export type IPhasePresentationKind =
  | 'InitialDeal'
  | 'Ready'
  | 'Draw'
  | 'Damage'
  | 'BattleEnd'
  | 'TurnEnd'

export type IPhasePresentationResponse = {
  presentationId: string
  phase: string
  kind: string
  turnNumber: number
  requiredAckPlayerIds: string[]
  acknowledgedPlayerIds: string[]
}

export type IGameClockPlayerResponse = {
  playerId: string
  secondsRemainingInPool: number
  consecutiveTimeouts: number
  timeoutsBeforeForfeit: number
}

/**
 * The action clock of the game. `deadlineUtc` is absolute and `serverNowUtc` is the server's own reading at mapping
 * time, so the client counts down locally without trusting its own clock. `deadlineUtc` is null while the engine is
 * not waiting on anybody (a system step, an outstanding presentation, or a finished game).
 */
export type IGameClockResponse = {
  isEnabled: boolean
  owningPlayerId: string | null
  stopKind: string
  deadlineUtc: string | null
  serverNowUtc: string
  secondsRemainingInStop: number | null
  players: IGameClockPlayerResponse[]
}

export type IGameStateResponse = {
  gameId: string
  turnNumber: number
  activePlayerId: string
  priorityPlayerId: string
  phase: string
  attackSequenceStage: string | null
  isAttackSequencePending: boolean
  isSupportResponseWindowOpen?: boolean
  supportChain?: ISupportChainEntryResponse[] | null
  effectNotices?: IEffectNoticeResponse[] | null
  // The tail of the game's action log, oldest first, already filtered for this player. Absent for a finished
  // game only if the server never recorded anything the player may read.
  actionLog?: IActionLogEntryResponse[] | null
  gameOutcome?: IGameOutcomeResponse | null
  pendingPresentation?: IPhasePresentationResponse | null
  animationEvents?: IAnimationEventResponse[] | null
  pendingAttackVisualState: IPendingAttackVisualStateResponse | null
  pendingPrompt: IPendingPromptResponse | null
  availableActions: IGameActionOptionResponse[]
  activeTemporaryEffects: IActiveTemporaryEffectResponse[]
  players: IGamePlayerStateResponse[]
  // Present only for a game created under a format: the rules both decks were validated against.
  ruleset?: IGameRulesetBindingResponse | null
  // The action clock, or null for a game whose clock has not been created yet. An untimed table publishes it with
  // isEnabled false so the board can say the game is untimed instead of guessing.
  clock?: IGameClockResponse | null
  // Host-only table rules this game runs with (see GameModifierKeys on the server). Absent for a plain table and
  // always absent in quick match.
  modifiers?: string[] | null
  // A redo waiting for the other player's answer. While it is set the table is frozen for both players.
  pendingRedo?: IRedoRequestResponse | null
  // The request whose approval moved the board. When it changes, the board paints the payload instead of animating
  // the difference between the two positions.
  lastRewindId?: string | null
  // True when asking for a redo would actually go somewhere.
  canRequestRedo?: boolean
}

export type IRedoRequestResponse = {
  requestId: string
  requestedByPlayerId: string
  approverPlayerId: string
  turnNumber: number
  phase: string
}

export type IGameRulesetBindingResponse = {
  id: string
  key: string
  name: string
}

export type IGameInstanceResponse = {
  id: string
}

export type IGameInstanceDetailResponse = IGameStateResponse
