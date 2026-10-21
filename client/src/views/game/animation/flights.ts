
import type {
  IDeckToHandAnimationArgs,
  IHandToPileAnimationArgs,
  IRectToDynamicElementAnimationArgs,
  IWaitForElementArgs,
} from '@/views/game/types'
import {
  DEFAULT_DYNAMIC_TARGET_MAX_FRAMES,
  DEFAULT_DYNAMIC_TARGET_TIMEOUT_MS,
  STANDARD_MOVEMENT_EASING,
} from './tuning'
import {
  registerFlight,
  resolveElementFlightKey,
  unregisterFlight,
} from './flightRegistry'
import { prefersReducedMotion, resolveFlightDurationMs } from './reducedMotion'

function promoteAirborneLayer(element: HTMLElement): () => void {
  const slot = element.parentElement
  const previousElementPosition = element.style.position
  const previousElementZIndex = element.style.zIndex
  const previousSlotPosition = slot?.style.position ?? ''
  const previousSlotZIndex = slot?.style.zIndex ?? ''
  const promoteSlot = slot !== null && slot !== document.body

  element.style.position = 'relative'
  element.style.zIndex = '260'
  if (promoteSlot) {
    slot.style.position = 'relative'
    slot.style.zIndex = '260'
  }

  return () => {
    element.style.position = previousElementPosition
    element.style.zIndex = previousElementZIndex
    if (promoteSlot) {
      slot.style.position = previousSlotPosition
      slot.style.zIndex = previousSlotZIndex
    }
  }
}

export function runElementFromRectAnimation({
  element,
  sourceRect,
  durationMs,
  key,
}: {
  element: HTMLElement
  sourceRect: DOMRect
  durationMs: number
  key?: string
}): Promise<void> {
  const resolvedDurationMs = resolveFlightDurationMs(durationMs)
  if (resolvedDurationMs <= 0) {
    return Promise.resolve()
  }

  const resolvedKey = key ?? resolveElementFlightKey(element)

  const destinationRect = element.getBoundingClientRect()
  if (destinationRect.width <= 0 || destinationRect.height <= 0 || sourceRect.width <= 0 || sourceRect.height <= 0) {
    return Promise.resolve()
  }

  const offsetX = sourceRect.left + sourceRect.width / 2 - (destinationRect.left + destinationRect.width / 2)
  const offsetY = sourceRect.top + sourceRect.height / 2 - (destinationRect.top + destinationRect.height / 2)
  const startTransform = `translate(${offsetX}px, ${offsetY}px)`

  if (element.hasAttribute('data-card-departed')) {
    element.removeAttribute('data-card-departed')
    element.style.visibility = ''
  }

  const previousTransform = element.style.transform
  const previousVisibility = element.style.visibility
  const previousWillChange = element.style.willChange
  let restoreAirborneLayer: (() => void) | null = null

  element.style.visibility = 'hidden'

  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      element.setAttribute('data-card-traveling', 'true')
      element.style.willChange = 'transform'
      restoreAirborneLayer = promoteAirborneLayer(element)
      element.style.transform = startTransform
      element.style.visibility = previousVisibility

      const animation = element.animate(
        [
          { transform: startTransform },
          { transform: 'translate(0px, 0px)' },
        ],
        { duration: resolvedDurationMs, easing: STANDARD_MOVEMENT_EASING },
      )

      let hasSettled = false
      const cleanup = () => {
        if (hasSettled) {
          return
        }
        hasSettled = true
        unregisterFlight(resolvedKey, animation)
        element.style.transform = previousTransform
        element.style.visibility = previousVisibility
        element.style.willChange = previousWillChange
        restoreAirborneLayer?.()
        element.removeAttribute('data-card-traveling')
        resolve()
      }

      animation.onfinish = cleanup
      animation.oncancel = cleanup
      registerFlight({ key: resolvedKey, element, animation })
    })
  })
}

export function runElementToRectAnimation({
  element,
  destinationRect,
  durationMs,
  key,
}: {
  element: HTMLElement
  destinationRect: DOMRect
  durationMs: number
  key?: string
}): Promise<void> {
  const resolvedDurationMs = resolveFlightDurationMs(durationMs)
  if (resolvedDurationMs <= 0) {
    return Promise.resolve()
  }

  const sourceRect = element.getBoundingClientRect()
  if (
    sourceRect.width <= 0
    || sourceRect.height <= 0
    || destinationRect.width <= 0
    || destinationRect.height <= 0
  ) {
    return Promise.resolve()
  }

  const resolvedKey = key ?? resolveElementFlightKey(element)
  const offsetX = destinationRect.left + destinationRect.width / 2 - (sourceRect.left + sourceRect.width / 2)
  const offsetY = destinationRect.top + destinationRect.height / 2 - (sourceRect.top + sourceRect.height / 2)
  const endScale = Math.max(destinationRect.width / sourceRect.width, 0.15)

  const previousTransform = element.style.transform
  element.setAttribute('data-card-traveling', 'true')
  const restoreAirborneLayer = promoteAirborneLayer(element)

  const animation = element.animate(
    [
      { transform: 'translate(0px, 0px) scale(1)' },
      { transform: `translate(${offsetX}px, ${offsetY}px) scale(${endScale})` },
    ],
    { duration: resolvedDurationMs, easing: STANDARD_MOVEMENT_EASING },
  )

  return new Promise<void>((resolve) => {
    let hasSettled = false

    const cleanup = () => {
      if (hasSettled) {
        return
      }
      hasSettled = true
      unregisterFlight(resolvedKey, animation)
      element.style.transform = previousTransform
      restoreAirborneLayer()
      element.removeAttribute('data-card-traveling')
      element.setAttribute('data-card-departed', 'true')
      element.style.visibility = 'hidden'
      resolve()
    }

    animation.onfinish = cleanup
    animation.oncancel = cleanup
    registerFlight({ key: resolvedKey, element, animation })
  })
}

export async function waitForElement({
  resolveElement,
  timeoutMs = DEFAULT_DYNAMIC_TARGET_TIMEOUT_MS,
  maxFrames = DEFAULT_DYNAMIC_TARGET_MAX_FRAMES,
}: IWaitForElementArgs): Promise<HTMLElement | null> {
  const immediateElement = resolveElement()
  if (immediateElement) {
    return immediateElement
  }

  const startedAt = performance.now()
  let frameCount = 0

  while (frameCount < maxFrames && performance.now() - startedAt <= timeoutMs) {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        resolve()
      })
    })

    const nextElement = resolveElement()
    if (nextElement) {
      return nextElement
    }

    frameCount += 1
  }

  return null
}

export async function runElementArrivalFromRectAnimation({
  sourceRect,
  resolveDestinationElement,
  resolveFallbackElement,
  durationMs = 360,
  timeoutMs,
  maxFrames,
}: IRectToDynamicElementAnimationArgs): Promise<void> {
  if (prefersReducedMotion()) {
    return
  }

  const resolveWhenLaidOut = (resolveElement: () => HTMLElement | null) => () => {
    const element = resolveElement()
    if (!element) {
      return null
    }

    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0 ? element : null
  }

  const destinationElement = await waitForElement({
    resolveElement: resolveWhenLaidOut(resolveDestinationElement),
    timeoutMs,
    maxFrames,
  }) ?? (resolveFallbackElement
    ? await waitForElement({
      resolveElement: resolveWhenLaidOut(resolveFallbackElement),
      timeoutMs,
      maxFrames,
    })
    : null)

  if (!destinationElement) {
    return
  }

  await runElementFromRectAnimation({
    element: destinationElement,
    sourceRect,
    durationMs,
  })
}

export function runHandToPileAnimation({
  side,
  destination,
  cardInstanceId,
  topDeckCardRef,
  bottomDeckCardRef,
  topTrashCardRef,
  bottomTrashCardRef,
  topHandRowRef,
  bottomHandRowRef,
}: IHandToPileAnimationArgs): Promise<void> {
  const sourceHandRowElement = side === 'top' ? topHandRowRef.current : bottomHandRowRef.current
  const destinationPileElement = destination === 'deck'
    ? side === 'top'
      ? topDeckCardRef.current
      : bottomDeckCardRef.current
    : side === 'top'
      ? topTrashCardRef.current
      : bottomTrashCardRef.current

  if (!sourceHandRowElement || !destinationPileElement) {
    return Promise.resolve()
  }

  const sourceCardElement = sourceHandRowElement.querySelector<HTMLDivElement>(
    `[data-hand-instance-id="${cardInstanceId}"]`,
  )
  if (!sourceCardElement) {
    return Promise.resolve()
  }
  const destinationRect = destinationPileElement.getBoundingClientRect()

  return runElementToRectAnimation({
    element: sourceCardElement,
    destinationRect,
    durationMs: 340,
    key: cardInstanceId,
  })
}


export async function waitMillis(durationMs: number): Promise<void> {
  if (durationMs <= 0) {
    return
  }

  await new Promise<void>((resolve) => {
    window.setTimeout(() => {
      resolve()
    }, durationMs)
  })
}

export async function runDeckToHandAnimation({
  side,
  cardInstanceId,
  topDeckCardRef,
  bottomDeckCardRef,
  topHandRowRef,
  bottomHandRowRef,
}: IDeckToHandAnimationArgs): Promise<void> {
  const sourceDeckElement = side === 'top' ? topDeckCardRef.current : bottomDeckCardRef.current
  const destinationHandRowElement = side === 'top' ? topHandRowRef.current : bottomHandRowRef.current

  if (!sourceDeckElement || !destinationHandRowElement) {
    return Promise.resolve()
  }
  const sourceRect = sourceDeckElement.getBoundingClientRect()

  if (sourceRect.width <= 0 || sourceRect.height <= 0) {
    return Promise.resolve()
  }

  if (prefersReducedMotion()) {
    return
  }

  const destinationElement = await waitForElement({
    resolveElement: () => {
      return destinationHandRowElement.querySelector<HTMLElement>(`[data-hand-instance-id="${cardInstanceId}"]`)
    },
  })
  if (!destinationElement) {
    return
  }

  await runElementFromRectAnimation({
    element: destinationElement,
    sourceRect,
    durationMs: 420,
    key: resolveElementFlightKey(destinationElement),
  })
}
