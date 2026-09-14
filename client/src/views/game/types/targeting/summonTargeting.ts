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
  // Server-declared tribute material groups (material label + how many distinct cards it consumes,
  // e.g. `Toad` x2 / `any` x1). Authoritative, so the client never infers group sizes itself.
  materialRequirements: NonNullable<IGameCardActionTargetsResponse['materialRequirements']>
  // Per tribute candidate, the short labels of the summon requirements it fulfills. An empty list
  // means the card only satisfies a generic "any" tribute material rule.
  requirementLabelsByCardInstanceId: Record<string, string[]>
}