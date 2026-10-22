
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

type ISuppressedInstanceVisualOwner = {
  count: number
  visibility: string
}

// Reference-counted so a superseded flight's cleanup cannot reveal an element the newer flight is still hiding.
const suppressedInstanceVisuals = new Map<HTMLElement, ISuppressedInstanceVisualOwner>()

function resolveElementInstanceId(element: HTMLElement): string {
  return element.dataset.cardInstanceId
    ?? element.dataset.handInstanceId
    ?? element.dataset.departingInstanceId
    ?? ''
}

/**
 * One visual per card instance: while `flyingElement` owns the flight for `instanceId`, every other element that
 * carries that same identity is hidden for the flight's duration.
 *
 * The hand row can keep a leaving card mounted for one extra commit (`AnimatePresence` renders a removed child
 * once before dropping it, even with no exit animation). That commit can be painted after the arrival flight
 * starts, so the played card exists in the hand row and in its destination at the same time - the reported
 * "ghost copy stays at the starting position". Hiding the non-flying element makes the invariant independent of
 * which render pass produced the second node.
 */
function suppressOtherInstanceVisuals(instanceId: string, flyingElement: HTMLElement): HTMLElement[] {
  if (!instanceId || typeof document === 'undefined') {
    return []
  }

  const escapedId = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(instanceId) : instanceId
  const selector = [
    `[data-hand-instance-id="${escapedId}"]`,
    `[data-card-instance-id="${escapedId}"]`,
    `[data-departing-instance-id="${escapedId}"]`,
  ].join(',')

  const suppressed: HTMLElement[] = []
  document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
    // Never hide the flying element or one that contains it: that would hide the flight itself.
    if (element === flyingElement || element.contains(flyingElement) || flyingElement.contains(element)) {
      return
    }

    const existingOwner = suppressedInstanceVisuals.get(element)
    if (existingOwner) {
      existingOwner.count += 1
      suppressed.push(element)
      return
    }

    if (element.style.visibility === 'hidden') {
      return
    }

    suppressedInstanceVisuals.set(element, { count: 1, visibility: element.style.visibility })
    element.style.visibility = 'hidden'
    suppressed.push(element)
  })

  return suppressed
}

function restoreSuppressedInstanceVisuals(suppressed: HTMLElement[]): void {
  for (const element of suppressed) {
    const owner = suppressedInstanceVisuals.get(element)
    if (!owner) {
      continue
    }

    owner.count -= 1
    if (owner.count > 0) {
      continue
    }

    suppressedInstanceVisuals.delete(element)
    element.style.visibility = owner.visibility
  }
}

const flightOwnerCounts = new Map<HTMLElement, number>()
let travelingFlightCount = 0

function acquireFlightOwner(half: HTMLElement): () => void {
  flightOwnerCounts.set(half, (flightOwnerCounts.get(half) ?? 0) + 1)
  half.setAttribute('data-flight-owner', 'true')

  let isReleased = false
  return () => {
    if (isReleased) {
      return
    }
    isReleased = true

    const nextCount = (flightOwnerCounts.get(half) ?? 1) - 1
    if (nextCount > 0) {
      flightOwnerCounts.set(half, nextCount)
      return
    }

    flightOwnerCounts.delete(half)
    half.removeAttribute('data-flight-owner')
  }
}

function markCardTraveling(element: HTMLElement): () => void {
  element.setAttribute('data-card-traveling', 'true')
  travelingFlightCount += 1
  document.body.setAttribute('data-card-flight-active', 'true')

  const half = element.closest<HTMLElement>('[data-board-half]')
  const releaseFlightOwner = half ? acquireFlightOwner(half) : null

  let isReleased = false
  return () => {
    if (isReleased) {
      return
    }
    isReleased = true

    element.removeAttribute('data-card-traveling')
    travelingFlightCount = Math.max(0, travelingFlightCount - 1)
    if (travelingFlightCount === 0) {
      document.body.removeAttribute('data-card-flight-active')
    }
    releaseFlightOwner?.()
  }
}

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
  let releaseTraveling: (() => void) | null = null

  // This flight is the only visual allowed for its instance while it is in the air.
  const suppressedVisuals = suppressOtherInstanceVisuals(resolveElementInstanceId(element), element)

  element.style.visibility = 'hidden'

  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      releaseTraveling = markCardTraveling(element)
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
      releaseTraveling?.()
      restoreSuppressedInstanceVisuals(suppressedVisuals)
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
  // This flight is the only visual allowed for its instance while it is in the air.
  const suppressedVisuals = suppressOtherInstanceVisuals(resolveElementInstanceId(element), element)
  const releaseTraveling = markCardTraveling(element)
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
      releaseTraveling()
      element.setAttribute('data-card-departed', 'true')
      element.style.visibility = 'hidden'
      restoreSuppressedInstanceVisuals(suppressedVisuals)
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
