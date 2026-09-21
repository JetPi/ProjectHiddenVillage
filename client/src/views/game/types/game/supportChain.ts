import type { IGameStateResponse } from '@/services/api/gameApi'

/** Who an activation belongs to, from the acting client's point of view. */
export type ISupportChainViewActor = 'you' | 'opponent' | 'unknown'

export type ISupportChainViewTarget = {
  cardInstanceId: string
  displayName: string
  ownerPlayerId: string
  isOwnCard: boolean
}

/** A queued activation this entry answers with a [Support Activated] negate. */
export type ISupportChainViewNegatedTarget = {
  sequence: number
  displayName: string
}

export type ISupportChainViewEntry = {
  entryId: string
  /** Activation order inside the chain, oldest first. */
  sequence: number
  actor: ISupportChainViewActor
  sourceCardInstanceId: string
  sourceCardDisplayName: string
  isNegated: boolean
  /** The activation is answered by a queued negate. */
  negatedTargets: ISupportChainViewNegatedTarget[]
  /** Cards (characters, supports, leaders) this activation picked. */
  cardTargets: ISupportChainViewTarget[]
  /** Sequence of the queued activation that negates this one, if any. */
  negatedBySequence: number | null
  /** The most recent activation, i.e. the one the chain resolves first. */
  resolvesNext: boolean
}

export type ISupportChainBubbleProps = {
  gameInstance: IGameStateResponse
  authUserId?: string
}
