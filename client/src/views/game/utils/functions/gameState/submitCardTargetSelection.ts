import type { Dispatch, SetStateAction } from 'react'
import type { IAttackFlowLinkState, IPendingCardTargetingState, ISubmitHubIntentRequest } from '@/views/game/types'

function submitCardTargetSelection({
  targetCardInstanceId,
  pendingCardTargeting,
  setPendingCardTargeting,
  setLastSubmittedAttackSourceInstanceId,
  setOptimisticRestedByInstanceId,
  setActiveAttackLink,
  submitHubIntent,
}: ISubmitCardTargetSelectionArgs): void {
  if (!pendingCardTargeting) {
    return
  }

  const selectedTarget = pendingCardTargeting.validTargets.find((target) =>
    target.cardInstanceId.trim().toLowerCase() === targetCardInstanceId.trim().toLowerCase())

  if (!selectedTarget) {
    return
  }

  const sourceCardInstanceId = pendingCardTargeting.sourceCardInstanceId
  const intentRequest: ISubmitHubIntentRequest = {
    intent: 'execute-card-action',
    actionId: pendingCardTargeting.actionId,
    sourceCardInstanceId,
    selectedTargets: [selectedTarget],
  }

  const isBattle = pendingCardTargeting.kind === 'battle'
  if (isBattle) {
    setLastSubmittedAttackSourceInstanceId(sourceCardInstanceId)
    setOptimisticRestedByInstanceId((previous) => ({
      ...previous,
      [sourceCardInstanceId]: true,
    }))
    setActiveAttackLink({
      sourceCardInstanceId,
      targetCardInstanceId: selectedTarget.cardInstanceId,
      targetZone: selectedTarget.zone,
      targetPlayerId: selectedTarget.playerId,
    })
  }

  setPendingCardTargeting(null)

  void (async () => {
    await submitHubIntent(intentRequest)
  })()
}

interface ISubmitCardTargetSelectionArgs {
  targetCardInstanceId: string
  pendingCardTargeting: IPendingCardTargetingState | null
  setPendingCardTargeting: Dispatch<SetStateAction<IPendingCardTargetingState | null>>
  setLastSubmittedAttackSourceInstanceId: Dispatch<SetStateAction<string | null>>
  setOptimisticRestedByInstanceId: Dispatch<SetStateAction<Record<string, boolean>>>
  setActiveAttackLink: Dispatch<SetStateAction<IAttackFlowLinkState | null>>
  submitHubIntent: (request: ISubmitHubIntentRequest) => Promise<void>
}

export { submitCardTargetSelection }
