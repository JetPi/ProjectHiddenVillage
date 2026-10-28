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
}
