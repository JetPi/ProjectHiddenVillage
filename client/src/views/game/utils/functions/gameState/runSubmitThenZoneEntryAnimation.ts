import type { ISubmitHubIntentRequest } from '@/views/game/types'
import { runElementArrivalFromRectAnimation } from '@/views/game/animation'

/**
 * Submits an action, then flies the card the action puts on the board from where the player took it from.
 *
 * The destination is resolved *after* the submit because that is when it exists (the engine picks the slot), so
 * the flight is carried by the arriving card rather than by the source: the card the state renders is the card
 * that travels. `beforeAnimation` runs between the two when the caller has to prepare the board for the arrival
 * (a battlefield display order that already contains the incoming card, for instance).
 */
async function runSubmitThenZoneEntryAnimation({
  submitHubIntent,
  intentRequest,
  sourceRect,
  beforeAnimation,
  resolveDestinationElement,
  resolveFallbackElement,
  durationMs,
  timeoutMs,
  maxFrames,
}: IRunSubmitThenZoneEntryAnimationArgs): Promise<void> {
  await submitHubIntent(intentRequest)
  beforeAnimation?.()

  if (!sourceRect) {
    return
  }

  await runElementArrivalFromRectAnimation({
    sourceRect,
    resolveDestinationElement,
    resolveFallbackElement,
    durationMs,
    timeoutMs,
    maxFrames,
  })
}

interface IRunSubmitThenZoneEntryAnimationArgs {
  submitHubIntent: (request: ISubmitHubIntentRequest) => Promise<void>
  intentRequest: ISubmitHubIntentRequest
  sourceRect: DOMRect | null
  beforeAnimation?: () => void
  resolveDestinationElement: () => HTMLElement | null
  resolveFallbackElement?: () => HTMLElement | null
  durationMs?: number
  timeoutMs?: number
  maxFrames?: number
}

export { runSubmitThenZoneEntryAnimation }
