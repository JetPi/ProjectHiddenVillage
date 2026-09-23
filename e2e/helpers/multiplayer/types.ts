import type { BrowserContext, Page } from '@playwright/test'

export type AuthSession = {
  userId: string
  username: string
  email: string
  accessToken: string
  expiresAt: string
}

export type PlayerAuth = {
  userId: string
  normalizedUserId: string
  session: AuthSession
  seedProfile: MultiplayerSeedPlayerProfile
}

export type MultiplayerSeedProfileName =
  | 'default'
  | 'summon-requirements'
  | 'summon-requirements-strict'
  | 'summon-requirements-multi'

export type MultiplayerSeedPlayerProfile = {
  id: string
  email: string
  password: string
  deckId: string
}

export type MultiplayerSetup = {
  gameCode: string
  playerOne: PlayerAuth
  playerTwo: PlayerAuth
  seedProfileName: MultiplayerSeedProfileName
}

export type MultiplayerPages = {
  playerOneContext: BrowserContext
  playerOnePage: Page
  playerTwoContext: BrowserContext
  playerTwoPage: Page
}

type PromptResponse = {
  type: string
  isAwaitingRequestingPlayer: boolean
  options: string[]
  // Effect prompts name the presentation bucket (e.g. 'RevealPresentation', 'PlaceOnDeckTop').
  selectionPromptKind?: string | null
  candidateZone?: string | null
}

type GameActionOptionResponse = {
  actionId: string
  label: string
  isEnabled: boolean
}

type GameCardInstanceStateResponse = {
  instanceId: string
  cardDefinitionId?: string
  isExhausted?: boolean
  isRested?: boolean
  isFaceUp?: boolean
  // True while a reveal shows this card's face to both players (the owner's deck cards carry it too).
  isRevealed?: boolean
  availableActions?: GameActionOptionResponse[]
}

export type GamePlayerStateResponse = {
  playerId: string
  leader: {
    instanceId?: string
    displayName: string
    isRested?: boolean
    // Leader effects (`leader-effect:{instanceId}:{effectKey}`) are published on the leader card
    // only - they never appear in the global `availableActions` list.
    availableActions?: GameActionOptionResponse[]
  }
  // Only the requesting player receives their whole deck, in draw order (top card first), so the
  // client/tests can read which card a "reveal the top card of your deck" effect is about to turn over.
  deck?: GameCardInstanceStateResponse[]
  hand: GameCardInstanceStateResponse[]
  characterField: GameCardInstanceStateResponse[]
  supportZone: GameCardInstanceStateResponse[]
  trash: GameCardInstanceStateResponse[]
}

export type GameStateResponse = {
  gameId: string
  activePlayerId: string
  priorityPlayerId?: string
  phase: string
  isSupportResponseWindowOpen?: boolean
  pendingPrompt: PromptResponse | null
  availableActions: GameActionOptionResponse[]
  players: GamePlayerStateResponse[]
}

export type LoginResponse = {
  id: string
  username: string
  email: string
  accessToken: string
  expiresAt: string
}
