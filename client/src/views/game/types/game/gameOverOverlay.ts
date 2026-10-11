import type { IGameOutcomeResponse } from '@/services/api/types/game'

/** Which side of the result the requesting player is on. */
export type IGameOutcomeStanding = 'victory' | 'defeat' | 'draw'

export type IGameOutcomePresentation = {
  standing: IGameOutcomeStanding
  /** The headline the overlay shows: "Victory" / "Defeat" / "Draw". */
  headline: string
  /** One line explaining how the game ended, in the board's own words. */
  reason: string
}

export type IGameOverOverlayProps = {
  outcome: IGameOutcomeResponse
  /** The signed-in user, used to decide Victory vs Defeat vs Draw. */
  authUserId?: string
}
