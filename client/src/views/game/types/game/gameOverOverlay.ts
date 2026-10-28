import type { IGameOutcomeResponse, IPendingRematchResponse } from '@/services/api/types/game'

export type IGameOutcomeStanding = 'victory' | 'defeat' | 'draw'

export type IGameOutcomePresentation = {
  standing: IGameOutcomeStanding
  headline: string
  reason: string
}

export type IGameOverOverlayProps = {
  outcome: IGameOutcomeResponse
  authUserId?: string
  /**
   * Takes the result off the board without leaving the game, so the finished position and the action log stay
   * readable. Leaving is the board's own return button once the overlay is gone.
   */
  onDismiss: () => void
  /**
   * The rematch offer travelling on the finished game's state, or null while nobody has offered one. Once both
   * players agreed it carries the reserved table code.
   */
  rematch?: IPendingRematchResponse | null
  /** Offers the opponent another match, or accepts theirs when the offer already exists. */
  onRequestRematch?: () => Promise<boolean>
  onAcceptRematch?: () => Promise<boolean>
  onDeclineRematch?: () => Promise<boolean>
  /**
   * Hands the reserved code to the login view so this player can pick the deck they bring to the next match and
   * claim a seat. The board does not seat anybody by itself: the deck choice is the point of the detour.
   */
  onChooseRematchDeck?: (code: string, rulesetName: string | null) => void
}
