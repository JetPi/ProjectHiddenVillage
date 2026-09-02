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
}

export type MultiplayerSetup = {
  gameCode: string
  playerOne: PlayerAuth
  playerTwo: PlayerAuth
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
