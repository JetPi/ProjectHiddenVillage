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
  // Effect selection prompts (type 'Effect'): copy bucket + where the candidate cards live.
  selectionPromptKind?: string | null
  candidateZone?: string | null
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
