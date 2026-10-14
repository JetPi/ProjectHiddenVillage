/**
 * The flight primitives: everything the board uses to move a card from one box to another.
 *
 * This file is part of the animation home (`views/game/animation/`), beside the tuning, the reduced-motion
 * policy, the flight registry and the flight layer itself. It used to live under `utils/functions/animations`,
 * which split "how a flight is tuned / owned / drawn" away from the primitives that used them.
 *
 * The rule is entity flight: **the card that travels is the card itself**, either the real card leaving a zone
 * (`runElementToRectAnimation`) or the real card arriving in one (`runElementFromRectAnimation`,
 * `runElementArrivalFromRectAnimation`). A fabricated overlay copy cannot be that card - it cannot even show a
 * face-down card's back, and its cover-fit/rounded-8 styling never matched the card it landed on.
 *
 * `animateOverlayCopy` and the flight layer survive only for the one path with no live element to move (a card
 * the client never rendered, such as a snapshot taken before a state update). That path is what the entity
 * primitives below are replacing, and it is retired with them.
 */

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

/**
 * Flies the real card element from `sourceRect` to its own, already laid out position.
 *
 * This is the entity-based flight: the element that stays on the board is the thing that travels, so there is
 * never a second card at either end of the motion, and the art, the face and the styling are the card's own -
 * a fabricated copy cannot reproduce those (a face-down card has no `<img>` to copy, and the copy's own
 * cover-fit/rounded-8/drop-shadow never matched the card it landed on).
 *
 * The element keeps its slot, which keeps its size, so nothing in the layout moves while the card flies.
 */
export function runElementFromRectAnimation({
  element,
  sourceRect,
  durationMs,
  key,
}: {
  element: HTMLElement
  sourceRect: DOMRect
  durationMs: number
  /** Ownership key; defaults to the element's card identity. */
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
  const startScale = Math.max(sourceRect.width / destinationRect.width, 0.15)
  const startTransform = `translate(${offsetX}px, ${offsetY}px) scale(${startScale})`

  const previousTransform = element.style.transform
  const previousVisibility = element.style.visibility
  const previousWillChange = element.style.willChange

  // The element is hidden for the single frame before the flight starts, so it can never flash at its slot
  // before appearing where it came from (the caller sees the same mount-to-flight frame gap either way).
  element.style.visibility = 'hidden'

  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      // Draw it at the source for this frame, then animate the remaining distance: the first painted frame of
      // the flight is already the offset one, so there is no jump.
      element.setAttribute('data-card-traveling', 'true')
      element.style.willChange = 'transform'
      element.style.transform = startTransform
      element.style.visibility = previousVisibility

      const animation = element.animate(
        [
          { transform: startTransform },
          { transform: 'translate(0px, 0px) scale(1)' },
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
        element.removeAttribute('data-card-traveling')
        resolve()
      }

      animation.onfinish = cleanup
      animation.oncancel = cleanup
      registerFlight({ key: resolvedKey, element, animation })
    })
  })
}

/**
 * Flies a real card element from where it is to a destination rect, for a card that leaves a zone before the
 * state removes it (a tribute material, a discard).
 *
 * This is the exit half of entity-based flight: the card that travels is the card itself, so nothing is left
 * sitting in place while a stand-in leaves. The caller stays responsible for the element's own lifecycle - the
 * flight only borrows its transform and restores it when the animation settles or is cancelled.
 *
 * It ends with the card **hidden**, because the card has left: an untouched resting spot would paint it back into
 * the row it came from for as long as the state that removes it takes to arrive. Restoring the transform while
 * leaving the card out of sight keeps the element's own state clean for whoever renders it next.
 */
export function runElementToRectAnimation({
  element,
  destinationRect,
  durationMs,
  key,
}: {
  element: HTMLElement
  destinationRect: DOMRect
  durationMs: number
  /** Ownership key; defaults to the element's card identity. */
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
  const previousZIndex = element.style.zIndex
  element.setAttribute('data-card-traveling', 'true')
  element.style.zIndex = '260'

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
      element.style.zIndex = previousZIndex
      element.removeAttribute('data-card-traveling')
      // The card has *left* the zone it was in. If the state that removes it has not arrived yet - one hub
      // round-trip is enough - restoring its resting spot paints it back where it came from, and that is exactly
      // what "the old cards appear in the hand for a moment before the new ones reappear" is. A card that travels
      // away does not come back: from the moment its flight lands it stays out of sight, and the state that
      // removes it takes the element away for good.
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

/**
 * Waits for the card a submit puts on the board, then flies *that real card* from `sourceRect` to its own slot.
 *
 * This is the arrival shape a submit needs: the hand card that was picked is already gone by the time the state
 * arrives (the submit moved it), so the card that travels is the destination - the element the player will look
 * at from now on. Nothing is fabricated, so the arriving card's own art, face and styling fly, and the motion
 * ends exactly on the card's own slot instead of on a stand-in drawn beside it.
 *
 * Reduced motion returns before the wait, so a reader who turned motion off never spins the frame loop waiting
 * for a destination that will not be animated.
 */
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

  // "Found" means found *and laid out*: a slot element that has mounted but has no box yet cannot be flown to,
  // and treating it as the destination is how an arrival ends up skipped entirely (the card lands with no
  // animation at all). Waiting for a box instead turns that race into a wait.
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

/**
 * Flies the hand card itself to the pile it leaves for (a discard, a card put on top of the deck, the mulligan
 * sending the opening hand back).
 *
 * The card is still mounted when this runs - the caller submits only once the flight has settled - so the card
 * the player can see is the card that travels. The destination is a pile slot rather than a card (the deck shows
 * a back, the trash shows its own top card), so this is an exit flight: the card borrows its own transform, and
 * the pile is only a rectangle to fly to.
 */
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
    // The card's own identity, so a second flight for the same card takes this one over instead of stacking.
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

  // The arriving hand card is the entity that travels: no copy is drawn, so nothing has to be hidden and
  // revealed around it. If the card is not on the board yet there is nothing to fly - better than dragging the
  // whole row around, which is what the copy engine's row fallback did.
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
