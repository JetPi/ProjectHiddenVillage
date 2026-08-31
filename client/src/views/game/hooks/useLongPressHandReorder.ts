import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type {
  ICardReorderPointerHandlers,
  IActiveDragState,
  IDragPointerState,
  IElementStyleSnapshot,
  IHandReorderCard,
  IUseLongPressHandReorderArgs,
  IUseLongPressHandReorderResult,
} from '@/views/game/types/handReorder'

const DEFAULT_LONG_PRESS_DELAY_MS = 260
const DEFAULT_START_MOVEMENT_TOLERANCE_PX = 14
const INVALID_DROP_SNAP_BACK_MS = 180
const MOUSE_POINTER_TYPE = 'mouse'

function hasInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false
  }

  return Boolean(target.closest('button,[role="button"],[data-prevent-hand-drag="true"]'))
}

function resolveInsertionIndex(
  rowElement: HTMLDivElement,
  pointerX: number,
  fallbackIndex: number,
  draggedCardInstanceId: string,
): number {
  const cardNodes = Array.from(rowElement.querySelectorAll<HTMLElement>('[data-hand-instance-id]')).filter((node) => {
    return node.getAttribute('data-hand-instance-id') !== draggedCardInstanceId
  })

  if (cardNodes.length === 0) {
    return fallbackIndex
  }

  for (let index = 0; index < cardNodes.length; index += 1) {
    const rect = cardNodes[index].getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    if (pointerX < centerX) {
      return index
    }
  }

  return cardNodes.length
}

function isPointerInsideElement(element: HTMLElement, clientX: number, clientY: number): boolean {
  const rect = element.getBoundingClientRect()
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
}

function snapshotCardStyles(element: HTMLDivElement): IElementStyleSnapshot {
  return {
    position: element.style.position,
    left: element.style.left,
    top: element.style.top,
    width: element.style.width,
    height: element.style.height,
    margin: element.style.margin,
    zIndex: element.style.zIndex,
    pointerEvents: element.style.pointerEvents,
    transition: element.style.transition,
    transform: element.style.transform,
    filter: element.style.filter,
  }
}

function restoreCardStyles(element: HTMLDivElement, snapshot: IElementStyleSnapshot): void {
  element.style.position = snapshot.position
  element.style.left = snapshot.left
  element.style.top = snapshot.top
  element.style.width = snapshot.width
  element.style.height = snapshot.height
  element.style.margin = snapshot.margin
  element.style.zIndex = snapshot.zIndex
  element.style.pointerEvents = snapshot.pointerEvents
  element.style.transition = snapshot.transition
  element.style.transform = snapshot.transform
  element.style.filter = snapshot.filter
}

function positionDraggedCardElement(activeDragState: IActiveDragState, clientX: number, clientY: number): void {
  const translateX = clientX - activeDragState.start.x
  const translateY = clientY - activeDragState.start.y
  activeDragState.element.style.transform = `translate(${translateX}px, ${translateY}px) scale(1.03)`
}

function resolveCardElement(cardInstanceId: string): HTMLDivElement | null {
  return document.querySelector<HTMLDivElement>(`[data-hand-instance-id="${cardInstanceId}"]`)
}

export function useLongPressHandReorder<TCard extends IHandReorderCard>({
  cards,
  rowRef,
  longPressDelayMs = DEFAULT_LONG_PRESS_DELAY_MS,
  startMovementTolerancePx = DEFAULT_START_MOVEMENT_TOLERANCE_PX,
}: IUseLongPressHandReorderArgs<TCard>): IUseLongPressHandReorderResult<TCard> {
  const [displayOrder, setDisplayOrder] = useState<string[]>(() => cards.map((card) => card.instanceId))
  const [activeDraggedInstanceId, setActiveDraggedInstanceId] = useState<string | null>(null)
  const [isReorderDragging, setIsReorderDragging] = useState(false)
  const pendingDragRef = useRef<IDragPointerState | null>(null)
  const dragPointerRef = useRef<IActiveDragState | null>(null)
  const longPressTimeoutIdRef = useRef<number | null>(null)
  const bodyUserSelectRef = useRef<string | null>(null)
  const bodyCursorRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      if (longPressTimeoutIdRef.current !== null) {
        window.clearTimeout(longPressTimeoutIdRef.current)
      }

      if (bodyUserSelectRef.current !== null) {
        document.body.style.userSelect = bodyUserSelectRef.current
        bodyUserSelectRef.current = null
      }

      if (bodyCursorRef.current !== null) {
        document.body.style.cursor = bodyCursorRef.current
        bodyCursorRef.current = null
      }
    }
  }, [])

  const orderedCards = useMemo(() => {
    const nextKnownIds = new Set(cards.map((card) => card.instanceId))
    const preservedIds = displayOrder.filter((instanceId) => nextKnownIds.has(instanceId))
    const preservedIdSet = new Set(preservedIds)
    const appendedIds = cards
      .map((card) => card.instanceId)
      .filter((instanceId) => !preservedIdSet.has(instanceId))
    const reconciledOrder = [...preservedIds, ...appendedIds]
    const cardById = new Map(cards.map((card) => [card.instanceId, card]))
    const ordered = reconciledOrder
      .map((instanceId) => cardById.get(instanceId))
      .filter((card): card is TCard => Boolean(card))

    if (ordered.length === cards.length) {
      return ordered
    }

    const knownOrderedIds = new Set(ordered.map((card) => card.instanceId))
    const missingCards = cards.filter((card) => !knownOrderedIds.has(card.instanceId))
    return [...ordered, ...missingCards]
  }, [cards, displayOrder])

  const activateDrag = useCallback((pointerState: IDragPointerState) => {
    const pointerElement = resolveCardElement(pointerState.cardInstanceId)
    if (!pointerElement) {
      return
    }

    const elementRect = pointerElement.getBoundingClientRect()
    if (elementRect.width <= 0 || elementRect.height <= 0) {
      return
    }

    const styleSnapshot = snapshotCardStyles(pointerElement)
    const activeDragState: IActiveDragState = {
      pointerId: pointerState.pointerId,
      cardInstanceId: pointerState.cardInstanceId,
      start: pointerState.start,
      startOrder: displayOrder,
      element: pointerElement,
      styleSnapshot,
    }

    pointerElement.style.position = 'fixed'
    pointerElement.style.left = `${elementRect.left}px`
    pointerElement.style.top = `${elementRect.top}px`
    pointerElement.style.width = `${elementRect.width}px`
    pointerElement.style.height = `${elementRect.height}px`
    pointerElement.style.margin = '0'
    pointerElement.style.zIndex = '320'
    pointerElement.style.pointerEvents = 'none'
    pointerElement.style.transition = 'none'
    pointerElement.style.filter = 'drop-shadow(0 8px 18px rgba(0, 0, 0, 0.45))'
    positionDraggedCardElement(activeDragState, pointerState.start.x, pointerState.start.y)

    if (bodyUserSelectRef.current === null) {
      bodyUserSelectRef.current = document.body.style.userSelect
      document.body.style.userSelect = 'none'
    }

    if (bodyCursorRef.current === null) {
      bodyCursorRef.current = document.body.style.cursor
      document.body.style.cursor = 'grabbing'
    }

    pendingDragRef.current = null
    dragPointerRef.current = activeDragState
    setActiveDraggedInstanceId(pointerState.cardInstanceId)
    setIsReorderDragging(true)
  }, [displayOrder])

  const clearPendingState = useCallback(() => {
    if (longPressTimeoutIdRef.current !== null) {
      window.clearTimeout(longPressTimeoutIdRef.current)
      longPressTimeoutIdRef.current = null
    }

    pendingDragRef.current = null
  }, [])

  const finalizeDrag = useCallback((pointerId: number) => {
    if (dragPointerRef.current?.pointerId !== pointerId) {
      return
    }

    dragPointerRef.current = null
    setIsReorderDragging(false)
    setActiveDraggedInstanceId(null)

    if (bodyUserSelectRef.current !== null) {
      document.body.style.userSelect = bodyUserSelectRef.current
      bodyUserSelectRef.current = null
    }

    if (bodyCursorRef.current !== null) {
      document.body.style.cursor = bodyCursorRef.current
      bodyCursorRef.current = null
    }
  }, [])

  const finalizeInvalidDrop = useCallback((pointerId: number, activeDragState: IActiveDragState) => {
    setDisplayOrder(activeDragState.startOrder)

    const { element } = activeDragState
    element.style.transition = `transform ${INVALID_DROP_SNAP_BACK_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
    element.style.transform = 'translate(0px, 0px) scale(1)'

    window.setTimeout(() => {
      if (dragPointerRef.current?.pointerId === pointerId) {
        restoreCardStyles(element, activeDragState.styleSnapshot)
        finalizeDrag(pointerId)
      }
    }, INVALID_DROP_SNAP_BACK_MS)
  }, [finalizeDrag])

  const finalizeValidDrop = useCallback((pointerId: number, activeDragState: IActiveDragState) => {
    restoreCardStyles(activeDragState.element, activeDragState.styleSnapshot)
    finalizeDrag(pointerId)
  }, [finalizeDrag])

  const handlePointerDown = useCallback((cardInstanceId: string, event: ReactPointerEvent<HTMLDivElement>) => {
    if (hasInteractiveTarget(event.target)) {
      return
    }

    if (cards.length <= 1) {
      return
    }

    clearPendingState()

    const nextPendingState: IDragPointerState = {
      pointerId: event.pointerId,
      cardInstanceId,
      start: { x: event.clientX, y: event.clientY },
    }

    pendingDragRef.current = nextPendingState

    if (event.pointerType === MOUSE_POINTER_TYPE) {
      activateDrag(nextPendingState)
      return
    }

    longPressTimeoutIdRef.current = window.setTimeout(() => {
      activateDrag(nextPendingState)
      longPressTimeoutIdRef.current = null
    }, longPressDelayMs)
  }, [activateDrag, cards.length, clearPendingState, longPressDelayMs])

  const handlePointerMove = useCallback((pointerId: number, clientX: number, clientY: number) => {
    const pendingState = pendingDragRef.current
    if (pendingState && pendingState.pointerId === pointerId) {
      const deltaX = clientX - pendingState.start.x
      const deltaY = clientY - pendingState.start.y
      if (Math.hypot(deltaX, deltaY) > startMovementTolerancePx) {
        clearPendingState()
      }
    }

    const dragState = dragPointerRef.current
    const rowElement = rowRef.current
    if (!dragState || dragState.pointerId !== pointerId || !rowElement) {
      return
    }

    positionDraggedCardElement(dragState, clientX, clientY)

    if (!isPointerInsideElement(rowElement, clientX, clientY)) {
      return
    }

    const currentIndex = displayOrder.indexOf(dragState.cardInstanceId)
    if (currentIndex < 0) {
      return
    }

    const nextIndex = resolveInsertionIndex(rowElement, clientX, currentIndex, dragState.cardInstanceId)
    if (nextIndex === currentIndex) {
      return
    }

    setDisplayOrder((previousOrder) => {
      const fromIndex = previousOrder.indexOf(dragState.cardInstanceId)
      if (fromIndex < 0) {
        return previousOrder
      }

      const boundedToIndex = Math.max(0, Math.min(nextIndex, previousOrder.length))
      if (fromIndex === boundedToIndex) {
        return previousOrder
      }

      const nextOrder = [...previousOrder]
      const [movedId] = nextOrder.splice(fromIndex, 1)
      nextOrder.splice(boundedToIndex, 0, movedId)
      return nextOrder
    })
  }, [clearPendingState, displayOrder, rowRef, startMovementTolerancePx])

  const handlePointerUp = useCallback((pointerId: number, clientX: number, clientY: number) => {
    if (pendingDragRef.current?.pointerId === pointerId) {
      clearPendingState()
    }

    const activeDragState = dragPointerRef.current
    const rowElement = rowRef.current
    if (activeDragState && activeDragState.pointerId === pointerId && rowElement) {
      const hasValidDrop = isPointerInsideElement(rowElement, clientX, clientY)
      if (hasValidDrop) {
        finalizeValidDrop(pointerId, activeDragState)
      } else {
        finalizeInvalidDrop(pointerId, activeDragState)
      }

      return
    }

    finalizeDrag(pointerId)
  }, [clearPendingState, finalizeDrag, finalizeInvalidDrop, finalizeValidDrop, rowRef])

  const handlePointerCancel = useCallback((pointerId: number) => {
    if (pendingDragRef.current?.pointerId === pointerId) {
      clearPendingState()
    }

    const activeDragState = dragPointerRef.current
    if (activeDragState && activeDragState.pointerId === pointerId) {
      finalizeInvalidDrop(pointerId, activeDragState)
      return
    }

    finalizeDrag(pointerId)
  }, [clearPendingState, finalizeDrag, finalizeInvalidDrop])

  useEffect(() => {
    function handleWindowPointerMove(event: PointerEvent): void {
      if (!dragPointerRef.current && !pendingDragRef.current) {
        return
      }

      event.preventDefault()
      handlePointerMove(event.pointerId, event.clientX, event.clientY)
    }

    function handleWindowPointerUp(event: PointerEvent): void {
      if (!dragPointerRef.current && !pendingDragRef.current) {
        return
      }

      handlePointerUp(event.pointerId, event.clientX, event.clientY)
    }

    function handleWindowPointerCancel(event: PointerEvent): void {
      if (!dragPointerRef.current && !pendingDragRef.current) {
        return
      }

      handlePointerCancel(event.pointerId)
    }

    window.addEventListener('pointermove', handleWindowPointerMove, { passive: false })
    window.addEventListener('pointerup', handleWindowPointerUp)
    window.addEventListener('pointercancel', handleWindowPointerCancel)

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove)
      window.removeEventListener('pointerup', handleWindowPointerUp)
      window.removeEventListener('pointercancel', handleWindowPointerCancel)
    }
  }, [handlePointerCancel, handlePointerMove, handlePointerUp])

  const getCardPointerHandlers = useCallback((cardInstanceId: string): ICardReorderPointerHandlers => {
    return {
      onPointerDown: (event) => {
        handlePointerDown(cardInstanceId, event)
      },
      onPointerMove: () => {
        // Movement is tracked globally so dragged card follows pointer across the viewport.
      },
      onPointerUp: () => {
        // Release handling is tracked globally for consistent drop behavior.
      },
      onPointerCancel: () => {
        // Cancellation handling is tracked globally for consistent recovery behavior.
      },
    }
  }, [handlePointerDown])

  return {
    orderedCards,
    activeDraggedInstanceId,
    isReorderDragging,
    getCardPointerHandlers,
  }
}