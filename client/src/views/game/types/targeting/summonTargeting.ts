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
  // Per tribute candidate, the short labels of the summon requirements it fulfills. An empty list
  // means the card only satisfies a generic "any" tribute material rule.
  requirementLabelsByCardInstanceId: Record<string, string[]>
}