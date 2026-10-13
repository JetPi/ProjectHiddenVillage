import type {
  ICardImageGhostToElementAnimationArgs,
  IDeckToHandAnimationArgs,
  IHandToElementAnimationArgs,
  IHandToPileAnimationArgs,
  IRectToDynamicElementAnimationArgs,
  IRectToElementAnimationArgs,
  IWaitForElementArgs,
} from "@/views/game/types"
import {
  DEFAULT_DYNAMIC_TARGET_MAX_FRAMES,
  DEFAULT_DYNAMIC_TARGET_TIMEOUT_MS,
  HAND_TO_ELEMENT_PIXELS_PER_MS,
  MAX_HAND_TO_ELEMENT_DURATION_MS,
  MIN_HAND_TO_ELEMENT_DURATION_MS,
  STANDARD_MOVEMENT_EASING,
} from "@/views/game/animation/tuning"
import { getCardFlightLayerElement } from "@/views/game/animation/cardFlightLayerMount"
import {
  registerFlight,
  resolveElementFlightKey,
  unregisterFlight,
} from "@/views/game/animation/flightRegistry"

/** Fallback key for a copy whose caller did not name the card it belongs to. */
let flightCopySequence = 0

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function resolveHandToElementDurationMs(translateX: number, translateY: number): number {
  const distance = Math.hypot(translateX, translateY)
  const rawDuration = Math.round(distance / HAND_TO_ELEMENT_PIXELS_PER_MS)
  return clamp(rawDuration, MIN_HAND_TO_ELEMENT_DURATION_MS, MAX_HAND_TO_ELEMENT_DURATION_MS)
}

/** The image a card is currently showing, or an empty string for a face-down/imageless card. */
function readCardImageSource(element: HTMLElement): string {
  const imageElement = element.querySelector<HTMLImageElement>('img')
  return imageElement?.currentSrc || imageElement?.src || ''
}

/**
 * Builds the overlay copy a flight animates: an image-only stand-in appended to the flight layer. The real
 * card is never moved, so nothing fights React's re-render and no layout ancestor has to be un-clipped for the
 * copy to travel. The copy carries the card's instance id in `data-flight-instance-id` (never
 * `data-card-instance-id`, which card locators rely on) so observers can attribute a flight to its card.
 */
function createFlightCopyElement(imageSrc: string, anchorRect: DOMRect, instanceKey: string): HTMLDivElement | null {
  const layer = getCardFlightLayerElement()
  if (!layer || anchorRect.width <= 0 || anchorRect.height <= 0) {
    return null
  }

  const layerRect = layer.getBoundingClientRect()
  const copy = document.createElement('div')
  copy.setAttribute('data-card-flight-copy', 'true')
  copy.setAttribute('data-flight-instance-id', instanceKey)
  copy.style.position = 'absolute'
  copy.style.left = `${anchorRect.left - layerRect.left}px`
  copy.style.top = `${anchorRect.top - layerRect.top}px`
  copy.style.width = `${anchorRect.width}px`
  copy.style.height = `${anchorRect.height}px`
  copy.style.willChange = 'transform'
  copy.style.transformOrigin = 'center center'
  copy.style.filter = 'drop-shadow(0 8px 18px rgba(0, 0, 0, 0.45))'
  copy.style.borderRadius = '8px'
  copy.style.overflow = 'hidden'
  copy.style.backgroundColor = 'var(--surface-elevated)'

  if (imageSrc) {
    const image = document.createElement('img')
    image.src = imageSrc
    image.alt = ''
    image.draggable = false
    image.style.width = '100%'
    image.style.height = '100%'
    image.style.objectFit = 'cover'
    image.style.borderRadius = '8px'
    copy.appendChild(image)
  }

  layer.appendChild(copy)
  return copy
}

/**
 * Flies an overlay copy from `sourceRect` to `destinationRect`. Only the copy is drawn; a real card already
 * rendered at the destination is hidden with `visibility` for the flight's duration (never transformed), so
 * the copy and the real card never render on top of each other.
 */
function animateOverlayCopy({
  imageSrc,
  sourceRect,
  destinationRect,
  durationMs,
  key,
  elementHiddenDuringFlight,
  mode,
}: {
  imageSrc: string
  sourceRect: DOMRect
  destinationRect: DOMRect
  durationMs: number
  key: string
  elementHiddenDuringFlight: HTMLElement | null
  mode: 'enter' | 'exit'
}): Promise<void> {
  if (destinationRect.width <= 0 || destinationRect.height <= 0) {
    return Promise.resolve()
  }

  // `enter` anchors the copy at the destination and animates it in from the source offset (so the recorded
  // first frame proves the card travelled); `exit` anchors it at the source and animates it towards the
  // destination offset.
  const anchorRect = mode === 'enter' ? destinationRect : sourceRect
  const copy = createFlightCopyElement(imageSrc, anchorRect, key)
  if (!copy) {
    return Promise.resolve()
  }

  const offsetX = destinationRect.left + destinationRect.width / 2 - (sourceRect.left + sourceRect.width / 2)
  const offsetY = destinationRect.top + destinationRect.height / 2 - (sourceRect.top + sourceRect.height / 2)
  const endScale = Math.max(destinationRect.width / sourceRect.width, 0.15)
  const previousVisibility = elementHiddenDuringFlight?.style.visibility ?? ''
  if (elementHiddenDuringFlight) {
    elementHiddenDuringFlight.style.visibility = 'hidden'
  }

  const startKeyframe = mode === 'enter'
    ? { transform: `translate(${-offsetX}px, ${-offsetY}px) scale(0.92)`, opacity: 0.96 }
    : { transform: 'translate(0px, 0px) scale(1)', opacity: 0.98 }
  const endKeyframe = mode === 'enter'
    ? { transform: 'translate(0px, 0px) scale(1)', opacity: 1 }
    : { transform: `translate(${offsetX}px, ${offsetY}px) scale(${endScale})`, opacity: 0.92 }

  const animation = copy.animate(
    [startKeyframe, endKeyframe],
    {
      duration: durationMs,
      easing: STANDARD_MOVEMENT_EASING,
    },
  )

  return new Promise<void>((resolve) => {
    let hasSettled = false

    const cleanup = () => {
      if (hasSettled) {
        return
      }
      hasSettled = true
      unregisterFlight(key, animation)
      if (elementHiddenDuringFlight) {
        elementHiddenDuringFlight.style.visibility = previousVisibility
      }
      copy.remove()
      resolve()
    }

    animation.onfinish = cleanup
    animation.oncancel = cleanup
    registerFlight({ key, element: copy, animation })
  })
}

/**
 * Animates a card leaving its current spot for a destination rectangle (a hand card on its way to a pile).
 * Only an overlay copy travels; the real source card is left where it is for the state update to remove.
 */
function animateCardEntityToDestination(
  sourceCardElement: HTMLDivElement,
  destinationRect: DOMRect,
  durationMs: number,
): Promise<void> {
  const sourceRect = sourceCardElement.getBoundingClientRect()
  if (sourceRect.width <= 0 || sourceRect.height <= 0) {
    return Promise.resolve()
  }

  return animateOverlayCopy({
    imageSrc: readCardImageSource(sourceCardElement),
    sourceRect,
    destinationRect,
    durationMs,
    key: resolveElementFlightKey(sourceCardElement),
    elementHiddenDuringFlight: null,
    mode: 'exit',
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

export async function runRectToDynamicElementAnimation({
  sourceRect,
  resolveDestinationElement,
  resolveFallbackElement,
  durationMs,
  timeoutMs,
  maxFrames,
}: IRectToDynamicElementAnimationArgs): Promise<void> {
  const destinationElement = await waitForElement({
    resolveElement: resolveDestinationElement,
    timeoutMs,
    maxFrames,
  })

  if (destinationElement) {
    await runRectToElementAnimation({
      sourceRect,
      destinationElement,
      durationMs,
    })
    return
  }

  if (!resolveFallbackElement) {
    return
  }

  const fallbackElement = await waitForElement({
    resolveElement: resolveFallbackElement,
    timeoutMs,
    maxFrames,
  })
  if (!fallbackElement) {
    return
  }

  await runRectToElementAnimation({
    sourceRect,
    destinationElement: fallbackElement,
    durationMs,
  })
}

/**
 * Flies an overlay copy from `sourceRect` into the destination element's box (a deck card drawn into the
 * hand, a summoned card arriving from a pile). The real destination card is hidden for the flight so the
 * copy reads as the same card landing, rather than a second copy appearing beside it.
 */
export function runRectToElementAnimation({
  sourceRect,
  destinationElement,
  durationMs = 360,
}: IRectToElementAnimationArgs): Promise<void> {
  if (!destinationElement) {
    return Promise.resolve()
  }

  return animateOverlayCopy({
    imageSrc: readCardImageSource(destinationElement),
    sourceRect,
    destinationRect: destinationElement.getBoundingClientRect(),
    durationMs,
    key: resolveElementFlightKey(destinationElement),
    elementHiddenDuringFlight: destinationElement,
    mode: 'enter',
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

  return animateCardEntityToDestination(sourceCardElement, destinationRect, 340)
}

/**
 * Flies a throwaway copy of a card's art from a captured rectangle towards a destination element.
 * Only the image is drawn (no overlays), and the real card in the DOM is never moved - so there is
 * no snap-back once the state update removes the source card.
 */
export function runCardImageGhostToElementAnimation({
  imageSrc,
  sourceRect,
  destinationElement,
  durationMs = 340,
  key,
}: ICardImageGhostToElementAnimationArgs): Promise<void> {
  if (!destinationElement) {
    return Promise.resolve()
  }

  return animateOverlayCopy({
    imageSrc,
    sourceRect,
    destinationRect: destinationElement.getBoundingClientRect(),
    durationMs,
    // The caller names the card the copy belongs to, so a second flight for the same card takes this one
    // over instead of stacking a second copy in the air.
    key: key ?? `flight-anonymous-${flightCopySequence++}`,
    elementHiddenDuringFlight: null,
    mode: 'exit',
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

export function runDeckToHandAnimation({
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

  return runRectToDynamicElementAnimation({
    sourceRect,
    durationMs: 420,
    resolveDestinationElement: () => {
      return destinationHandRowElement.querySelector<HTMLElement>(`[data-hand-instance-id="${cardInstanceId}"]`)
    },
    resolveFallbackElement: () => {
      return destinationHandRowElement
    },
  })
}

export function runHandToElementAnimation({
  side,
  cardInstanceId,
  destinationElement,
  topHandRowRef,
  bottomHandRowRef,
}: IHandToElementAnimationArgs): Promise<void> {
  const sourceHandRowElement = side === 'top' ? topHandRowRef.current : bottomHandRowRef.current

  if (!sourceHandRowElement || !destinationElement) {
    return Promise.resolve()
  }

  const sourceCardElement = sourceHandRowElement.querySelector<HTMLDivElement>(
    `[data-hand-instance-id="${cardInstanceId}"]`,
  )
  if (!sourceCardElement) {
    return Promise.resolve()
  }

  const destinationRect = destinationElement.getBoundingClientRect()

  const sourceRect = sourceCardElement.getBoundingClientRect()
  const sourceCenterX = sourceRect.left + sourceRect.width / 2
  const sourceCenterY = sourceRect.top + sourceRect.height / 2
  const destinationCenterX = destinationRect.left + destinationRect.width / 2
  const destinationCenterY = destinationRect.top + destinationRect.height / 2
  const translateX = destinationCenterX - sourceCenterX
  const translateY = destinationCenterY - sourceCenterY
  const animationDurationMs = resolveHandToElementDurationMs(translateX, translateY)

  return animateCardEntityToDestination(sourceCardElement, destinationRect, animationDurationMs)
}
