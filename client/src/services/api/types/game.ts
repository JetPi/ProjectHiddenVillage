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
  gameOutcome?: IGameOutcomeResponse | null
  pendingPresentation?: IPhasePresentationResponse | null
  animationEvents?: IAnimationEventResponse[] | null
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
