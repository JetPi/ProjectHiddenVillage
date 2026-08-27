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
}: IHandToPileAnimationArgs): void {
  const sourceHandRowElement = side === 'top' ? topHandRowRef.current : bottomHandRowRef.current
  const destinationPileElement = destination === 'deck'
    ? side === 'top'
      ? topDeckCardRef.current
      : bottomDeckCardRef.current
    : side === 'top'
      ? topTrashCardRef.current
      : bottomTrashCardRef.current

  if (!sourceHandRowElement || !destinationPileElement) {
    return
  }

  const sourceCardElement = sourceHandRowElement.querySelector<HTMLDivElement>(
    `[data-hand-instance-id="${cardInstanceId}"]`,
  )
  if (!sourceCardElement) {
    return
  }

  const sourceRect = sourceCardElement.getBoundingClientRect()
  const destinationRect = destinationPileElement.getBoundingClientRect()

  if (sourceRect.width <= 0 || sourceRect.height <= 0 || destinationRect.width <= 0 || destinationRect.height <= 0) {
    return
  }

  const sourceCenterX = sourceRect.left + sourceRect.width / 2
  const sourceCenterY = sourceRect.top + sourceRect.height / 2
  const destinationCenterX = destinationRect.left + destinationRect.width / 2
  const destinationCenterY = destinationRect.top + destinationRect.height / 2
  const translateX = destinationCenterX - sourceCenterX
  const translateY = destinationCenterY - sourceCenterY

  const movingCardElement = sourceCardElement.cloneNode(true) as HTMLDivElement
  movingCardElement.style.position = 'fixed'
  movingCardElement.style.left = `${sourceCenterX}px`
  movingCardElement.style.top = `${sourceCenterY}px`
  movingCardElement.style.width = `${sourceRect.width}px`
  movingCardElement.style.height = `${sourceRect.height}px`
  movingCardElement.style.margin = '0'
  movingCardElement.style.pointerEvents = 'none'
  movingCardElement.style.zIndex = '220'
  movingCardElement.style.transform = 'translate(-50%, -50%)'
  movingCardElement.style.filter = 'drop-shadow(0 8px 18px rgba(0, 0, 0, 0.45))'

  document.body.appendChild(movingCardElement)

  const animation = movingCardElement.animate(
    [
      {
        transform: 'translate(-50%, -50%) translate(0px, 0px) scale(1)',
        opacity: 0.98,
      },
      {
        transform: `translate(-50%, -50%) translate(${translateX}px, ${translateY}px) scale(0.9)`,
        opacity: 0.92,
      },
    ],
    {
      duration: 340,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    },
  )

  animation.onfinish = () => {
    movingCardElement.remove()
  }

  animation.oncancel = () => {
    movingCardElement.remove()
  }
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
}: IDeckToHandAnimationArgs): void {
  const sourceDeckElement = side === 'top' ? topDeckCardRef.current : bottomDeckCardRef.current
  const destinationHandRowElement = side === 'top' ? topHandRowRef.current : bottomHandRowRef.current

  if (!sourceDeckElement || !destinationHandRowElement) {
    return
  }

  const destinationCardElement = destinationHandRowElement.querySelector<HTMLDivElement>(
    `[data-hand-instance-id="${cardInstanceId}"]`,
  )
  const sourceRect = sourceDeckElement.getBoundingClientRect()
  const destinationRect = (destinationCardElement ?? destinationHandRowElement).getBoundingClientRect()

  if (sourceRect.width <= 0 || sourceRect.height <= 0 || destinationRect.width <= 0 || destinationRect.height <= 0) {
    return
  }

  const sourceCenterX = sourceRect.left + sourceRect.width / 2
  const sourceCenterY = sourceRect.top + sourceRect.height / 2
  const destinationCenterX = destinationRect.left + destinationRect.width / 2
  const destinationCenterY = destinationRect.top + destinationRect.height / 2
  const translateX = destinationCenterX - sourceCenterX
  const translateY = destinationCenterY - sourceCenterY

  const movingCardElement = sourceDeckElement.cloneNode(true) as HTMLDivElement
  movingCardElement.style.position = 'fixed'
  movingCardElement.style.left = `${sourceCenterX}px`
  movingCardElement.style.top = `${sourceCenterY}px`
  movingCardElement.style.width = `${sourceRect.width}px`
  movingCardElement.style.height = `${sourceRect.height}px`
  movingCardElement.style.margin = '0'
  movingCardElement.style.pointerEvents = 'none'
  movingCardElement.style.zIndex = '220'
  movingCardElement.style.transform = 'translate(-50%, -50%)'
  movingCardElement.style.filter = 'drop-shadow(0 8px 18px rgba(0, 0, 0, 0.45))'

  document.body.appendChild(movingCardElement)

  const animation = movingCardElement.animate(
    [
      {
        transform: 'translate(-50%, -50%) translate(0px, 0px) scale(1)',
        opacity: 0.97,
      },
      {
        transform: `translate(-50%, -50%) translate(${translateX}px, ${translateY}px) scale(0.92)`,
        opacity: 0.99,
      },
    ],
    {
      duration: 420,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    },
  )

  animation.onfinish = () => {
    movingCardElement.remove()
  }

  animation.oncancel = () => {
    movingCardElement.remove()
  }
}

export function runHandToElementAnimation({
  side,
  cardInstanceId,
  destinationElement,
  topHandRowRef,
  bottomHandRowRef,
}: IHandToElementAnimationArgs): void {
  const sourceHandRowElement = side === 'top' ? topHandRowRef.current : bottomHandRowRef.current

  if (!sourceHandRowElement || !destinationElement) {
    return
  }

  const sourceCardElement = sourceHandRowElement.querySelector<HTMLDivElement>(
    `[data-hand-instance-id="${cardInstanceId}"]`,
  )
  if (!sourceCardElement) {
    return
  }

  const sourceRect = sourceCardElement.getBoundingClientRect()
  const destinationRect = destinationElement.getBoundingClientRect()

  if (sourceRect.width <= 0 || sourceRect.height <= 0 || destinationRect.width <= 0 || destinationRect.height <= 0) {
    return
  }

  const sourceCenterX = sourceRect.left + sourceRect.width / 2
  const sourceCenterY = sourceRect.top + sourceRect.height / 2
  const destinationCenterX = destinationRect.left + destinationRect.width / 2
  const destinationCenterY = destinationRect.top + destinationRect.height / 2
  const translateX = destinationCenterX - sourceCenterX
  const translateY = destinationCenterY - sourceCenterY
  const animationDurationMs = resolveHandToElementDurationMs(translateX, translateY)

  const movingCardElement = sourceCardElement.cloneNode(true) as HTMLDivElement
  movingCardElement.style.position = 'fixed'
  movingCardElement.style.left = `${sourceCenterX}px`
  movingCardElement.style.top = `${sourceCenterY}px`
  movingCardElement.style.width = `${sourceRect.width}px`
  movingCardElement.style.height = `${sourceRect.height}px`
  movingCardElement.style.margin = '0'
  movingCardElement.style.pointerEvents = 'none'
  movingCardElement.style.zIndex = '220'
  movingCardElement.style.transform = 'translate(-50%, -50%)'
  movingCardElement.style.filter = 'drop-shadow(0 8px 18px rgba(0, 0, 0, 0.45))'

  document.body.appendChild(movingCardElement)

  const animation = movingCardElement.animate(
    [
      {
        transform: 'translate(-50%, -50%) translate(0px, 0px) scale(1)',
        opacity: 0.98,
      },
      {
        transform: `translate(-50%, -50%) translate(${translateX}px, ${translateY}px) scale(0.9)`,
        opacity: 0.92,
      },
    ],
    {
      duration: animationDurationMs,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    },
  )

  animation.onfinish = () => {
    movingCardElement.remove()
  }

  animation.oncancel = () => {
    movingCardElement.remove()
  }
}
