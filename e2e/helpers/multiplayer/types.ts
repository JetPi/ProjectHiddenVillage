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

export type MultiplayerSeedProfileName = 'default' | 'summon-requirements' | 'summon-requirements-strict'

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
  availableActions?: GameActionOptionResponse[]
}

export type GamePlayerStateResponse = {
  playerId: string
  leader: {
    displayName: string
  }
  hand: GameCardInstanceStateResponse[]
  characterField: GameCardInstanceStateResponse[]
  supportZone: GameCardInstanceStateResponse[]
  trash: GameCardInstanceStateResponse[]
}

export type GameStateResponse = {
  gameId: string
  activePlayerId: string
  phase: string
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
