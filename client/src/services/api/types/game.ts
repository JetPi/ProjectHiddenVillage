export type ICreateGameForUserRequest = {
  userId: string
  deckId: string
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
  isRested: boolean
  supportSlotIndex?: number | null
  // True while a reveal shows this card's face to both players. Distinct from isFaceUp: a deck card is data-wise
  // face up yet hidden from the opponent (and, for the owner, indistinguishable from any other deck card) until
  // a reveal turns it over.
  isRevealed?: boolean
  // Live (enriched) instance stats — present on battlefield/hand cards.
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
  // Effect selection prompts (type 'Effect'): copy bucket + where the candidate cards live, and which player
  // owns that zone (an effect may offer the opponent's trash, not just the acting player's own zones).
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

export type ISupportChainTargetResponse = {
  cardInstanceId: string
  displayName: string
  ownerPlayerId: string
  // True when the target is another queued activation: the card this one answers with a negate.
  isChainEntry: boolean
  chainEntryId: string | null
}

export type ISupportChainEntryResponse = {
  entryId: string
  // Activation order inside the chain, oldest first.
  sequence: number
  playerId: string
  sourceCardInstanceId: string
  sourceCardDisplayName: string
  isNegated: boolean
  targets: ISupportChainTargetResponse[]
}

export type IEffectNoticeResponse = {
  /** Action-log entry id: the server republishes the notice list on every push, so the client de-dupes on it. */
  noticeId: string
  actionType: string
  message: string
  playerId: string | null
  sourceCardInstanceId: string | null
  sourceCardDisplayName: string | null
  selectionPromptKind: string | null
}

/**
 * The terminal result of a game. The server writes it exactly once; while it is absent the game is running.
 * `winnerPlayerId` is null for a draw (both players lost at the same instant and every tiebreak tied).
 */
export type IGameOutcomeResponse = {
  winnerPlayerId: string | null
  loserPlayerIds: string[]
  /** `LeaderLifeDepleted` or `DeckOut`. */
  reason: string
  turnNumber: number
}

export type IGameStateResponse = {
  gameId: string
  turnNumber: number
  activePlayerId: string
  priorityPlayerId: string
  phase: string
  attackSequenceStage: string | null
  isAttackSequencePending: boolean
  // True while an activated support waits for responses in the MainPhase ([Support Activated] window).
  isSupportResponseWindowOpen?: boolean
  // Support activations still waiting on the resolution stack, oldest first.
  supportChain?: ISupportChainEntryResponse[] | null
  // Notices for the requesting player, oldest first (an effect that resolved with nothing to act on). The board
  // shows the newest unnoticed one as a transient toast.
  effectNotices?: IEffectNoticeResponse[] | null
  // The result of the game. When present the engine publishes no actions or prompt at all, and the board only
  // offers the result overlay's "return to main page" button.
  gameOutcome?: IGameOutcomeResponse | null
  pendingAttackVisualState: IPendingAttackVisualStateResponse | null
  pendingPrompt: IPendingPromptResponse | null
  availableActions: IGameActionOptionResponse[]
  activeTemporaryEffects: IActiveTemporaryEffectResponse[]
  players: IGamePlayerStateResponse[]
}

export type IGameInstanceResponse = {
  id: string
}

export type IGameInstanceDetailResponse = IGameStateResponse
