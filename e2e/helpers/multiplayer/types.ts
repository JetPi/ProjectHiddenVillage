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
  | 'on-summon-trash-recall'
  | 'deck-out'

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
  // Effect prompts name the presentation bucket (e.g. 'RevealPresentation', 'PlaceOnDeckTop') and where the
  // candidates live ('Hand', 'Deck', 'Trash', ...) plus which player owns that zone.
  selectionPromptKind?: string | null
  candidateZone?: string | null
  candidatePlayerId?: string | null
}

type GameActionOptionResponse = {
  actionId: string
  label: string
  isEnabled: boolean
  // Why the action is disabled, straight from the mapper (e.g. "Recovery can only be activated starting
  // from your second turn."). The board renders it as the chip's title, so a spec can tell a rule-driven
  // disabled chip apart from one that only looks disabled.
  disabledReason?: string | null
}

type GameCardInstanceStateResponse = {
  instanceId: string
  cardDefinitionId?: string
  isExhausted?: boolean
  isRested?: boolean
  isFaceUp?: boolean
  // True while a reveal shows this card's face to both players (the owner's deck cards carry it too).
  isRevealed?: boolean
  // Enriched fields (battlefield cards): the resolved DMG/POW/health the board is showing.
  damage?: number
  power?: number
  health?: number
  availableActions?: GameActionOptionResponse[]
}

export type GamePlayerStateResponse = {
  playerId: string
  leader: {
    instanceId?: string
    displayName: string
    isRested?: boolean
    // Leader life: only chipped by an attacker's DMG and never reset at the turn boundary. `currentLife`
    // may sit *above* `totalLife` (the printed maximum) after a life-gain effect.
    currentLife?: number
    totalLife?: number
    // Resolved leader DMG, i.e. the value the leader chips off an opposing leader's life with.
    damage?: number
    // Leader effects (`leader-effect:{instanceId}:{effectKey}`) are published on the leader card
    // only - they never appear in the global `availableActions` list.
    availableActions?: GameActionOptionResponse[]
  }
  // Only the requesting player receives their whole deck, in draw order (top card first), so the
  // client/tests can read which card a "reveal the top card of your deck" effect is about to turn over.
  deck?: GameCardInstanceStateResponse[]
  // Face-up chakra count: spending chakra flips a card face-down, and Recovery is how it comes back.
  resourcePool: number
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
  // True while an attack waits for its cut-in window to close: the client draws the attack-link arrow
  // from it, and an interrupted attack clears it.
  isAttackSequencePending?: boolean
  isSupportResponseWindowOpen?: boolean
  // The result of a finished game: written once by the engine, and the only thing the board offers once it
  // is present (no actions, no prompt). Absent/null while the game is still running.
  gameOutcome?: GameOutcomeResponse | null
  pendingPrompt: PromptResponse | null
  availableActions: GameActionOptionResponse[]
  players: GamePlayerStateResponse[]
}

export type GameOutcomeResponse = {
  /** Null for a draw (both players lost at the same instant and every tiebreak metric was tied). */
  winnerPlayerId: string | null
  loserPlayerIds: string[]
  /** `LeaderLifeDepleted` or `DeckOut`. */
  reason: string
  turnNumber: number
}

export type LoginResponse = {
  id: string
  username: string
  email: string
  accessToken: string
  expiresAt: string
}
