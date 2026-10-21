import type { IGameActionOptionResponse } from '@/services/api/types/game'
import type { IGameCardActionTargetsRequest, IGameCardActionTargetsResponse } from '@/services/api/types/gameHub'
import type { IAttackTargetingState, IEffectTargetingState, ISubmitHubIntentRequest } from '@/views/game/types'
import { mapActionToHubIntent } from './helpers'

async function trySubmitTargetedCardEffect({
  action,
  canResolvePrompt,
  submitHubIntent,
  getCardActionTargets,
  beginEffectTargeting,
  beginEffectMultiTargeting,
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

  if (validTargets.length === 0) {
    await submitHubIntent({
      intent: 'execute-card-action',
      actionId: intentRequest.actionId,
      sourceCardInstanceId: intentRequest.sourceCardInstanceId,
    })
    return
  }

  if (requiresSingleTargetPick) {
    beginEffectTargeting({
      actionId: intentRequest.actionId,
      sourceCardInstanceId: intentRequest.sourceCardInstanceId,
      validTargets,
    })
    return
  }

  beginEffectMultiTargeting({
    actionId: intentRequest.actionId,
    sourceCardInstanceId: intentRequest.sourceCardInstanceId,
    validTargets,
    exactTargetCount,
    minimumTargetCount,
    maximumTargetCount,
    selectedTargets: [],
  })
}

interface ITrySubmitTargetedCardEffectArgs {
  action: IGameActionOptionResponse
  canResolvePrompt: boolean
  submitHubIntent: (request: ISubmitHubIntentRequest) => Promise<void>
  getCardActionTargets: (
    request: Omit<IGameCardActionTargetsRequest, 'playerId'>,
  ) => Promise<IGameCardActionTargetsResponse | null>
  beginEffectTargeting: (targeting: IAttackTargetingState) => void
  beginEffectMultiTargeting: (targeting: IEffectTargetingState) => void
}

export { trySubmitTargetedCardEffect }
