import type { IDeckToHandAnimationArgs, IHandToElementAnimationArgs, IHandToPileAnimationArgs } from "@/views/game/types/animations"

const MIN_HAND_TO_ELEMENT_DURATION_MS = 220
const MAX_HAND_TO_ELEMENT_DURATION_MS = 520
const HAND_TO_ELEMENT_PIXELS_PER_MS = 3.3

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function resolveHandToElementDurationMs(translateX: number, translateY: number): number {
  const distance = Math.hypot(translateX, translateY)
  const rawDuration = Math.round(distance / HAND_TO_ELEMENT_PIXELS_PER_MS)
  return clamp(rawDuration, MIN_HAND_TO_ELEMENT_DURATION_MS, MAX_HAND_TO_ELEMENT_DURATION_MS)
}

type IOverflowSnapshot = {
  element: HTMLElement
  overflow: string
  overflowX: string
  overflowY: string
}

function resolveOverflowAncestors(startElement: HTMLElement): IOverflowSnapshot[] {
  const snapshots: IOverflowSnapshot[] = []
  let current: HTMLElement | null = startElement.parentElement

  while (current && current !== document.body) {
    const computedStyle = window.getComputedStyle(current)
    const hasClipping =
      computedStyle.overflow !== 'visible'
      || computedStyle.overflowX !== 'visible'
      || computedStyle.overflowY !== 'visible'

    if (hasClipping) {
      snapshots.push({
        element: current,
        overflow: current.style.overflow,
        overflowX: current.style.overflowX,
        overflowY: current.style.overflowY,
      })

      current.style.overflow = 'visible'
      current.style.overflowX = 'visible'
      current.style.overflowY = 'visible'
    }

    current = current.parentElement
  }

  return snapshots
}

function restoreOverflowAncestors(snapshots: IOverflowSnapshot[]): void {
  snapshots.forEach((snapshot) => {
    snapshot.element.style.overflow = snapshot.overflow
    snapshot.element.style.overflowX = snapshot.overflowX
    snapshot.element.style.overflowY = snapshot.overflowY
  })
}

function animateCardEntityToDestination(
  sourceCardElement: HTMLDivElement,
  destinationRect: DOMRect,
  durationMs: number,
): Promise<void> {
  const sourceRect = sourceCardElement.getBoundingClientRect()

  if (sourceRect.width <= 0 || sourceRect.height <= 0 || destinationRect.width <= 0 || destinationRect.height <= 0) {
    return Promise.resolve()
  }

  const sourceCenterX = sourceRect.left + sourceRect.width / 2
  const sourceCenterY = sourceRect.top + sourceRect.height / 2
  const destinationCenterX = destinationRect.left + destinationRect.width / 2
  const destinationCenterY = destinationRect.top + destinationRect.height / 2
  const translateX = destinationCenterX - sourceCenterX
  const translateY = destinationCenterY - sourceCenterY

  const previousTransition = sourceCardElement.style.transition
  const previousTransform = sourceCardElement.style.transform
  const previousZIndex = sourceCardElement.style.zIndex
  const previousPointerEvents = sourceCardElement.style.pointerEvents
  const previousFilter = sourceCardElement.style.filter
  const overflowSnapshots = resolveOverflowAncestors(sourceCardElement)

  sourceCardElement.style.zIndex = '260'
  sourceCardElement.style.pointerEvents = 'none'
  sourceCardElement.style.filter = 'drop-shadow(0 8px 18px rgba(0, 0, 0, 0.45))'
  sourceCardElement.style.transition = 'none'

  return new Promise<void>((resolve) => {
    const animation = sourceCardElement.animate(
      [
        {
          transform: 'translate(0px, 0px) scale(1)',
          opacity: 0.98,
        },
        {
          transform: `translate(${translateX}px, ${translateY}px) scale(0.9)`,
          opacity: 0.92,
        },
      ],
      {
        duration: durationMs,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    )

    const cleanup = () => {
      sourceCardElement.style.transition = previousTransition
      sourceCardElement.style.transform = previousTransform
      sourceCardElement.style.zIndex = previousZIndex
      sourceCardElement.style.pointerEvents = previousPointerEvents
      sourceCardElement.style.filter = previousFilter
      restoreOverflowAncestors(overflowSnapshots)
      resolve()
    }

    animation.onfinish = cleanup
    animation.oncancel = cleanup
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

  const destinationCardElement = destinationHandRowElement.querySelector<HTMLDivElement>(
    `[data-hand-instance-id="${cardInstanceId}"]`,
  )
  if (!destinationCardElement) {
    return Promise.resolve()
  }

  const sourceRect = sourceDeckElement.getBoundingClientRect()
  const destinationRect = destinationCardElement.getBoundingClientRect()

  if (sourceRect.width <= 0 || sourceRect.height <= 0 || destinationRect.width <= 0 || destinationRect.height <= 0) {
    return Promise.resolve()
  }

  const sourceCenterX = sourceRect.left + sourceRect.width / 2
  const sourceCenterY = sourceRect.top + sourceRect.height / 2
  const destinationCenterX = destinationRect.left + destinationRect.width / 2
  const destinationCenterY = destinationRect.top + destinationRect.height / 2
  const fromTranslateX = sourceCenterX - destinationCenterX
  const fromTranslateY = sourceCenterY - destinationCenterY

  const previousTransition = destinationCardElement.style.transition
  const previousTransform = destinationCardElement.style.transform
  const previousZIndex = destinationCardElement.style.zIndex
  const previousPointerEvents = destinationCardElement.style.pointerEvents
  const previousFilter = destinationCardElement.style.filter
  const overflowSnapshots = resolveOverflowAncestors(destinationCardElement)

  destinationCardElement.style.zIndex = '260'
  destinationCardElement.style.pointerEvents = 'none'
  destinationCardElement.style.filter = 'drop-shadow(0 8px 18px rgba(0, 0, 0, 0.45))'
  destinationCardElement.style.transition = 'none'

  return new Promise<void>((resolve) => {
    const animation = destinationCardElement.animate(
      [
        {
          transform: `translate(${fromTranslateX}px, ${fromTranslateY}px) scale(0.92)`,
          opacity: 0.97,
        },
        {
          transform: 'translate(0px, 0px) scale(1)',
          opacity: 0.99,
        },
      ],
      {
        duration: 420,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    )

    const cleanup = () => {
      destinationCardElement.style.transition = previousTransition
      destinationCardElement.style.transform = previousTransform
      destinationCardElement.style.zIndex = previousZIndex
      destinationCardElement.style.pointerEvents = previousPointerEvents
      destinationCardElement.style.filter = previousFilter
      restoreOverflowAncestors(overflowSnapshots)
      resolve()
    }

    animation.onfinish = cleanup
    animation.oncancel = cleanup
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
