import type { IGameCardActionTargetsResponse } from '@/services/api/types/gameHub'

export type IAttackTargetingState = {
  actionId: string
  sourceCardInstanceId: string
  validTargets: IGameCardActionTargetsResponse['validTargets']
}

export type IAttackFlowLinkState = {
  sourceCardInstanceId: string
  targetCardInstanceId: string
  targetZone: string
  targetPlayerId: string
}
