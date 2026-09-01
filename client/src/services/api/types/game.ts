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
}

export type IGameLeaderCardInstanceResponse = {
  instanceId: string
  cardDefinitionId: string
  ownerPlayerId: string
  controllerPlayerId: string
  isExhausted: boolean
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
}

export type IPendingPromptResponse = {
  promptId: string
  type: string
  isAwaitingRequestingPlayer: boolean
  options: string[]
}

export type IPendingAttackVisualStateResponse = {
  attackerCardInstanceId: string
  defenderPlayerId: string
  defenderCardInstanceId: string
  defenderZone: string
}

export type IGameStateResponse = {
  gameId: string
  turnNumber: number
  activePlayerId: string
  priorityPlayerId: string
  phase: string
  attackSequenceStage: string | null
  isAttackSequencePending: boolean
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
