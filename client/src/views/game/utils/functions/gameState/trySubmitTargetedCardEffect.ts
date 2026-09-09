import type { IGameActionOptionResponse } from '@/services/api/types/game'
import type { IGameCardActionTargetsRequest, IGameCardActionTargetsResponse } from '@/services/api/types/gameHub'
import type { IAttackTargetingState, ISubmitHubIntentRequest } from '@/views/game/types'
import { mapActionToHubIntent } from './helpers'

async function trySubmitTargetedCardEffect({
  action,
  canResolvePrompt,
  submitHubIntent,
  getCardActionTargets,
  beginEffectTargeting,
}: ITrySubmitTargetedCardEffectArgs): Promise<void> {
  if (!action.isEnabled) {
    return
  }

  const intentRequest = mapActionToHubIntent(action, canResolvePrompt)
  if (!intentRequest || intentRequest.intent !== 'execute-card-action') {
    return
  }

  const targetsResponse = await getCardActionTargets({
    actionId: intentRequest.actionId,
    sourceCardInstanceId: intentRequest.sourceCardInstanceId,
  })

  if (!targetsResponse || !targetsResponse.isEnabled) {
    return
  }

  const validTargets = targetsResponse.validTargets
  const exactTargetCount = targetsResponse.exactTargetCount
  const minimumTargetCount = targetsResponse.minimumTargetCount
  const maximumTargetCount = targetsResponse.maximumTargetCount
  const autoSelectAll = targetsResponse.autoSelectAllValidTargets && validTargets.length > 0

  // When the player must pick a single target, always enter target selection —
  // even when only one legal candidate exists — so activating a leader/support
  // effect never resolves (and spends chakra) without an explicit target click.
  const requiresSingleTargetPick =
    validTargets.length > 0
    && (exactTargetCount === null || exactTargetCount === 1)
    && (minimumTargetCount === null || minimumTargetCount === 1)
    && (maximumTargetCount === null || maximumTargetCount === 1)

  if (autoSelectAll) {
    await submitHubIntent({
      intent: 'execute-card-action',
      actionId: intentRequest.actionId,
      sourceCardInstanceId: intentRequest.sourceCardInstanceId,
      selectedTargets: validTargets,
    })
    return
  }

  if (requiresSingleTargetPick) {
    beginEffectTargeting({
      actionId: intentRequest.actionId,
      sourceCardInstanceId: intentRequest.sourceCardInstanceId,
      validTargets,
    })
  }
}

interface ITrySubmitTargetedCardEffectArgs {
  action: IGameActionOptionResponse
  canResolvePrompt: boolean
  submitHubIntent: (request: ISubmitHubIntentRequest) => Promise<void>
  getCardActionTargets: (
    request: Omit<IGameCardActionTargetsRequest, 'playerId'>,
  ) => Promise<IGameCardActionTargetsResponse | null>
  beginEffectTargeting: (targeting: IAttackTargetingState) => void
}

export { trySubmitTargetedCardEffect }
