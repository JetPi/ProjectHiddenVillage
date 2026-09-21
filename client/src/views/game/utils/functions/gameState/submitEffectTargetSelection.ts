import type { Dispatch, SetStateAction } from 'react'
import type { IEffectTargetingState, ISubmitHubIntentRequest } from '@/views/game/types'
import { canConfirmEffectTargetSelection } from './canConfirmEffectTargetSelection'

/**
 * Submits a confirmed multi-target effect pick. Unlike a summon this moves no card of ours, so there is
 * no deck/hand animation to chain: the selection is cleared optimistically (an `actionError` rolls the
 * board back through the store's prune) and the engine resolves the activation on the hub.
 */
function submitEffectTargetSelection({
  pendingEffectTargeting,
  setPendingEffectTargeting,
  submitHubIntent,
}: ISubmitEffectTargetSelectionArgs): void {
  if (!pendingEffectTargeting || !canConfirmEffectTargetSelection(pendingEffectTargeting)) {
    return
  }

  const intentRequest: ISubmitHubIntentRequest = {
    intent: 'execute-card-action',
    actionId: pendingEffectTargeting.actionId,
    sourceCardInstanceId: pendingEffectTargeting.sourceCardInstanceId,
    selectedTargets: pendingEffectTargeting.selectedTargets,
  }

  setPendingEffectTargeting(null)

  void submitHubIntent(intentRequest)
}

interface ISubmitEffectTargetSelectionArgs {
  pendingEffectTargeting: IEffectTargetingState | null
  setPendingEffectTargeting: Dispatch<SetStateAction<IEffectTargetingState | null>>
  submitHubIntent: (request: ISubmitHubIntentRequest) => Promise<void>
}

export { submitEffectTargetSelection }
