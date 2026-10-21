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
}
