import type { ISubmitHubIntentRequest } from '@/views/game/types'
import { runRectToDynamicElementAnimation } from '@/views/game/utils/functions/animations'

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

  await runRectToDynamicElementAnimation({
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
