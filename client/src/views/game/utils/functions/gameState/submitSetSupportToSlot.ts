import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { IGameActionOptionResponse, IGameCardInstanceResponse } from '@/services/api/types/game'
import type { ISubmitHubIntentRequest } from '@/views/game/types'
import { mapActionToHubIntent } from './helpers'
import { runSubmitThenZoneEntryAnimation } from './runSubmitThenZoneEntryAnimation'

function submitSetSupportToSlot({
  slotIndex,
  pendingSetSupportCardInstanceId,
  setPendingSetSupportCardInstanceId,
  mappedAvailableActions,
  bottomHandCards,
  occupiedBottomSupportSlots,
  canResolvePrompt,
  submitHubIntent,
  bottomHandRowRef,
  boardZoneRef,
}: ISubmitSetSupportToSlotArgs): void {
  if (!pendingSetSupportCardInstanceId) {
    return
  }

  const pendingActionId = `set-support:${pendingSetSupportCardInstanceId}`
  const action = mappedAvailableActions.find((option) => option.actionId === pendingActionId)
    ?? bottomHandCards
      .find((card) => card.instanceId === pendingSetSupportCardInstanceId)
      ?.availableActions
      ?.find((option) => option.actionId === pendingActionId)

  if (!action) {
    setPendingSetSupportCardInstanceId(null)
    return
  }

  if (slotIndex < 0 || slotIndex > 4) {
    return
  }

  if (occupiedBottomSupportSlots.has(slotIndex)) {
    return
  }

  const intentRequest = mapActionToHubIntent(
    action,
    canResolvePrompt,
    undefined,
    { supportSlotIndex: slotIndex.toString() },
  )

  const sourceCardElement = bottomHandRowRef.current?.querySelector<HTMLDivElement>(
    `[data-hand-instance-id="${pendingSetSupportCardInstanceId}"]`,
  ) ?? null
  const sourceRect = sourceCardElement?.getBoundingClientRect() ?? null

  if (!intentRequest) {
    return
  }

  const cardInstanceId = pendingSetSupportCardInstanceId
  setPendingSetSupportCardInstanceId(null)

  void (async () => {
    await runSubmitThenZoneEntryAnimation({
      submitHubIntent,
      intentRequest,
      sourceRect,
      resolveDestinationElement: () => {
        const exactCardElement = boardZoneRef.current?.querySelector<HTMLElement>(
          `[data-zone="support"][data-slot-side="bottom"][data-card-instance-id="${cardInstanceId}"]`,
        ) ?? null
        if (exactCardElement) {
          return exactCardElement
        }

        return boardZoneRef.current?.querySelector<HTMLElement>(
          `[data-zone="support"][data-slot-side="bottom"][data-slot-index="${slotIndex}"][data-card-instance-id]`,
        ) ?? null
      },
      timeoutMs: 1800,
      maxFrames: 120,
    })
  })()
}

interface ISubmitSetSupportToSlotArgs {
  slotIndex: number
  pendingSetSupportCardInstanceId: string | null
  setPendingSetSupportCardInstanceId: Dispatch<SetStateAction<string | null>>
  mappedAvailableActions: IGameActionOptionResponse[]
  bottomHandCards: IGameCardInstanceResponse[]
  occupiedBottomSupportSlots: Set<number>
  canResolvePrompt: boolean
  submitHubIntent: (request: ISubmitHubIntentRequest) => Promise<void>
  bottomHandRowRef: RefObject<HTMLDivElement | null>
  boardZoneRef: RefObject<HTMLDivElement | null>
}

export { submitSetSupportToSlot }
