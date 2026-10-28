import type { IGameOutcomeResponse } from '@/services/api/types/game'

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
}
