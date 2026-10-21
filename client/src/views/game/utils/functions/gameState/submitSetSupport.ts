import type { RefObject } from 'react'
import type { IGameActionOptionResponse } from '@/services/api/types/game'
import type { ISubmitHubIntentRequest } from '@/views/game/types'
import { mapActionToHubIntent } from './helpers'
import { runSubmitThenZoneEntryAnimation } from './runSubmitThenZoneEntryAnimation'

function submitSetSupport({
  action,
  cardInstanceId,
  canResolvePrompt,
  submitHubIntent,
  bottomHandRowRef,
  boardZoneRef,
}: ISubmitSetSupportArgs): void {
  const intentRequest = mapActionToHubIntent(action, canResolvePrompt)
  if (!intentRequest) {
    return
  }

  const sourceCardElement = bottomHandRowRef.current?.querySelector<HTMLDivElement>(
    `[data-hand-instance-id="${cardInstanceId}"]`,
  ) ?? null
  const sourceRect = sourceCardElement?.getBoundingClientRect() ?? null

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
          `[data-zone="support"][data-slot-side="bottom"][data-card-instance-id]`,
        ) ?? null
      },
      timeoutMs: 1800,
      maxFrames: 120,
    })
  })()
}

interface ISubmitSetSupportArgs {
  action: IGameActionOptionResponse
  cardInstanceId: string
  canResolvePrompt: boolean
  submitHubIntent: (request: ISubmitHubIntentRequest) => Promise<void>
  bottomHandRowRef: RefObject<HTMLDivElement | null>
  boardZoneRef: RefObject<HTMLDivElement | null>
}

export { submitSetSupport }
