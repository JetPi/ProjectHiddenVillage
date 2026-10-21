import type { IGameCardActionExecutionRequest, IGameCardActionTargetsResponse } from '@/services/api/types/gameHub'

export type IEffectTargetingState = {
  actionId: string
  sourceCardInstanceId: string
  validTargets: IGameCardActionTargetsResponse['validTargets']
  exactTargetCount: number | null
  minimumTargetCount: number | null
  maximumTargetCount: number | null
  selectedTargets: NonNullable<IGameCardActionExecutionRequest['selectedTargets']>
}
