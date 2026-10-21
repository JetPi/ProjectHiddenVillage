import type { Dispatch, SetStateAction } from 'react'
import type { IEffectTargetingState, ISubmitHubIntentRequest } from '@/views/game/types'
import { canConfirmEffectTargetSelection } from './canConfirmEffectTargetSelection'

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
