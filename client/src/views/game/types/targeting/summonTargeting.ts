import type { IGameCardActionExecutionRequest, IGameCardActionTargetsResponse } from '@/services/api/types/gameHub'

export type ISummonTargetingState = {
  actionId: string
  sourceCardInstanceId: string
  validTargets: IGameCardActionTargetsResponse['validTargets']
  minimumTargetCount: number | null
  maximumTargetCount: number | null
  exactTargetCount: number | null
  autoSelectAllValidTargets: boolean
  selectedTargets: NonNullable<IGameCardActionExecutionRequest['selectedTargets']>
}