import type { IGameStateResponse } from '@/services/api/gameApi'

export type ISupportChainViewActor = 'you' | 'opponent' | 'unknown'

export type ISupportChainViewTarget = {
  cardInstanceId: string
  displayName: string
  ownerPlayerId: string
  isOwnCard: boolean
}

export type ISupportChainViewNegatedTarget = {
  sequence: number
  displayName: string
}

export type ISupportChainViewEntry = {
  entryId: string
  sequence: number
  actor: ISupportChainViewActor
  sourceCardInstanceId: string
  sourceCardDisplayName: string
  isNegated: boolean
  negatedTargets: ISupportChainViewNegatedTarget[]
  cardTargets: ISupportChainViewTarget[]
  negatedBySequence: number | null
  resolvesNext: boolean
}

export type ISupportChainBubbleProps = {
  gameInstance: IGameStateResponse
  authUserId?: string
}
