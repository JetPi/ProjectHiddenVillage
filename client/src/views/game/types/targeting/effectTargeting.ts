import type { IGameCardActionExecutionRequest, IGameCardActionTargetsResponse } from '@/services/api/types/gameHub'

/**
 * Multi-target effect selection ("Choose up to 2 rested Characters: K.O. the chosen cards.").
 *
 * Single-target effects stay on `pendingCardTargeting` (`kind: 'effect'`) and are resolved with one
 * "Choose" click. Effects declaring a range (`exactTargetCount`/`maximumTargetCount` above 1) cannot be
 * expressed that way, so they open this state instead: the board toggles candidates and the phase row
 * confirms. The server owns the counts, the client only distributes the current selection over them.
 */
export type IEffectTargetingState = {
  actionId: string
  sourceCardInstanceId: string
  validTargets: IGameCardActionTargetsResponse['validTargets']
  exactTargetCount: number | null
  minimumTargetCount: number | null
  maximumTargetCount: number | null
  selectedTargets: NonNullable<IGameCardActionExecutionRequest['selectedTargets']>
}
