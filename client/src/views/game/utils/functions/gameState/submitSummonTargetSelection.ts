import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { IGameCardInstanceResponse } from '@/services/api/types/game'
import type { ISubmitHubIntentRequest, ISummonTargetingState } from '@/views/game/types'
import { canConfirmSummonTargetSelection } from './canConfirmSummonTargetSelection'
import { runSubmitThenZoneEntryAnimation } from './runSubmitThenZoneEntryAnimation'

function submitSummonTargetSelection({
  pendingSummonTargeting,
  setPendingSummonTargeting,
  submitHubIntent,
  bottomHandRowRef,
  boardZoneRef,
  currentBottomBattlefieldRawCards,
  setBottomBattlefieldDisplayOrder,
}: ISubmitSummonTargetSelectionArgs): void {
  if (!pendingSummonTargeting || !canConfirmSummonTargetSelection(pendingSummonTargeting)) {
    return
  }

  const sourceCardInstanceId = pendingSummonTargeting.sourceCardInstanceId
  const sourceCardElement = bottomHandRowRef.current?.querySelector<HTMLDivElement>(
    `[data-hand-instance-id="${sourceCardInstanceId}"]`,
  ) ?? null
  const sourceRect = sourceCardElement?.getBoundingClientRect() ?? null
  const expectedBattlefieldSlotIndex = currentBottomBattlefieldRawCards.length
  const intentRequest: ISubmitHubIntentRequest = {
    intent: 'execute-card-action',
    actionId: pendingSummonTargeting.actionId,
    sourceCardInstanceId,
    selectedTargets: pendingSummonTargeting.selectedTargets,
  }

  setPendingSummonTargeting(null)

  void (async () => {
    await runSubmitThenZoneEntryAnimation({
      submitHubIntent,
      intentRequest,
      sourceRect,
      beforeAnimation: () => {
        setBottomBattlefieldDisplayOrder((previousOrder) => {
          const knownIds = new Set(currentBottomBattlefieldRawCards.map((card) => card.instanceId))
          const preservedIds = previousOrder.filter((instanceId) => knownIds.has(instanceId))
          if (preservedIds.includes(sourceCardInstanceId)) {
            return preservedIds
          }

          return [...preservedIds, sourceCardInstanceId]
        })
      },
      resolveDestinationElement: () => {
        const exactCardElement = boardZoneRef.current?.querySelector<HTMLElement>(
          `[data-zone="character-field-card"][data-slot-side="bottom"][data-card-instance-id="${sourceCardInstanceId}"]`,
        ) ?? null
        if (exactCardElement) {
          return exactCardElement
        }

        return boardZoneRef.current?.querySelector<HTMLElement>(
          `[data-zone="character-field-card"][data-slot-side="bottom"][data-slot-index="${expectedBattlefieldSlotIndex}"]`,
        ) ?? null
      },
      timeoutMs: 1800,
      maxFrames: 120,
    })
  })()
}

interface ISubmitSummonTargetSelectionArgs {
  pendingSummonTargeting: ISummonTargetingState | null
  setPendingSummonTargeting: Dispatch<SetStateAction<ISummonTargetingState | null>>
  submitHubIntent: (request: ISubmitHubIntentRequest) => Promise<void>
  bottomHandRowRef: RefObject<HTMLDivElement | null>
  boardZoneRef: RefObject<HTMLDivElement | null>
  currentBottomBattlefieldRawCards: IGameCardInstanceResponse[]
  setBottomBattlefieldDisplayOrder: Dispatch<SetStateAction<string[]>>
}

export { submitSummonTargetSelection }
