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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function hasInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false
  }

  return Boolean(target.closest('button,[role="button"],[data-prevent-hand-drag="true"]'))
}

type IDragRowGeometry = {
  rowRect: { left: number; right: number; top: number; bottom: number }
  cards: { instanceId: string; centerX: number }[]
}

function readDragRowGeometry(rowElement: HTMLElement, draggedCardInstanceId: string): IDragRowGeometry {
  const rowRect = rowElement.getBoundingClientRect()
  const geometry: IDragRowGeometry = {
    rowRect: {
      left: rowRect.left,
      right: rowRect.right,
      top: rowRect.top,
      bottom: rowRect.bottom,
    },
    cards: [],
  }

  const cardNodes = rowElement.querySelectorAll<HTMLElement>('[data-hand-instance-id]')
  for (const node of cardNodes) {
    if (node.getAttribute('data-hand-instance-id') === draggedCardInstanceId) {
      continue
    }

    const rect = node.getBoundingClientRect()
    geometry.cards.push({
      instanceId: node.getAttribute('data-hand-instance-id') ?? '',
      centerX: rect.left + rect.width / 2,
    })
  }

  return geometry
}

function resolveInsertionIndexFromGeometry(
  cards: IDragRowGeometry['cards'],
  pointerX: number,
  fallbackIndex: number,
): number {
  for (let index = 0; index < cards.length; index += 1) {
    if (pointerX < cards[index].centerX) {
      return index
    }
  }

  return cards.length === 0 ? fallbackIndex : cards.length
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

function reconcileOrder(order: string[], cards: IHandReorderCard[]): string[] {
  const knownIds = new Set(cards.map((card) => card.instanceId))
  const preservedOrder = order.filter((instanceId) => knownIds.has(instanceId))
  const knownOrderedIds = new Set(preservedOrder)
  const appendedIds = cards
    .map((card) => card.instanceId)
    .filter((instanceId) => !knownOrderedIds.has(instanceId))

  return [...preservedOrder, ...appendedIds]
}

export function useLongPressHandReorder<TCard extends IHandReorderCard>({
  cards,
  rowRef,
  longPressDelayMs = DEFAULT_LONG_PRESS_DELAY_MS,
  startMovementTolerancePx = DEFAULT_START_MOVEMENT_TOLERANCE_PX,
}: IUseLongPressHandReorderArgs<TCard>): IUseLongPressHandReorderResult<TCard> {
  const [displayOrder, setDisplayOrder] = useState<string[]>(() => cards.map((card) => card.instanceId))
  const latestCardsRef = useRef<IHandReorderCard[]>(cards)
  const [activeDraggedInstanceId, setActiveDraggedInstanceId] = useState<string | null>(null)
  const [isReorderDragging, setIsReorderDragging] = useState(false)
  const pendingDragRef = useRef<IDragPointerState | null>(null)
  const dragPointerRef = useRef<IActiveDragState | null>(null)
  const longPressTimeoutIdRef = useRef<number | null>(null)
  const hasSeenValidReorderTargetRef = useRef(false)
  const bodyUserSelectRef = useRef<string | null>(null)
  const bodyCursorRef = useRef<string | null>(null)
  const suppressClickAfterDragRef = useRef(false)
  const pendingPointerMoveRef = useRef<{ pointerId: number; clientX: number; clientY: number } | null>(null)
  const moveRafIdRef = useRef<number | null>(null)
  const handlePointerMoveRef = useRef<(pointerId: number, clientX: number, clientY: number) => void>(() => {})
  const dragGeometryRef = useRef<IDragRowGeometry | null>(null)
  const previousCardsCountRef = useRef(cards.length)

  useEffect(() => {
    latestCardsRef.current = cards

    // If a card enters/leaves the hand mid-drag, the cached row geometry is stale.
    if (dragPointerRef.current !== null && previousCardsCountRef.current !== cards.length) {
      dragGeometryRef.current = null
    }

    previousCardsCountRef.current = cards.length
  }, [cards])

  useEffect(() => {
    return () => {
      if (moveRafIdRef.current !== null) {
        window.cancelAnimationFrame(moveRafIdRef.current)
        moveRafIdRef.current = null
      }

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
    const reconciledOrder = reconcileOrder(displayOrder, cards)
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
      startOrder: reconcileOrder(displayOrder, latestCardsRef.current),
      element: pointerElement,
      rowElement: pointerElement.closest('[data-testid="bottom-hand-row"]') as HTMLDivElement | null,
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
    dragGeometryRef.current = null
    hasSeenValidReorderTargetRef.current = false
    setDisplayOrder((previousOrder) => {
      const reconciledOrder = reconcileOrder(previousOrder, latestCardsRef.current)
      return reconciledOrder
    })
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
    dragGeometryRef.current = null
    hasSeenValidReorderTargetRef.current = false
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

  // After a real drag ends, the browser may synthesize a click at the release point
  // (for example over the same card action button the drag started on). Suppress that
  // one click so releasing a reorder drag cannot accidentally trigger card controls.
  const armClickSuppression = useCallback(() => {
    suppressClickAfterDragRef.current = true
    window.setTimeout(() => {
      suppressClickAfterDragRef.current = false
    }, 0)
  }, [])

  useEffect(() => {
    function handleWindowClickCapture(event: MouseEvent): void {
      if (event.detail === 0) {
        // Keyboard/assistive-tech activation is not a drag-release click.
        return
      }

      if (!suppressClickAfterDragRef.current) {
        return
      }

      suppressClickAfterDragRef.current = false
      event.preventDefault()
      event.stopPropagation()
    }

    window.addEventListener('click', handleWindowClickCapture, true)
    return () => {
      window.removeEventListener('click', handleWindowClickCapture, true)
    }
  }, [])

  const handlePointerDown = useCallback((cardInstanceId: string, event: ReactPointerEvent<HTMLDivElement>) => {
    if (cards.length <= 1) {
      return
    }

    const pointerTarget = event.target
    if (!(pointerTarget instanceof Node) || !event.currentTarget.contains(pointerTarget)) {
      // Pointer events dispatched inside DOM that lives outside this card's subtree still
      // bubble through this card in the React tree when they originate from a portal
      // rendered by this card (e.g. the card-details overlay is createPortal'd into <body>).
      // Such events must never arm or activate a reorder drag, otherwise a click meant to
      // dismiss the details overlay would instead lift/drag the card underneath it.
      return
    }

    clearPendingState()

    const nextPendingState: IDragPointerState = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      cardInstanceId,
      start: { x: event.clientX, y: event.clientY },
      wasOverInteractiveTarget: hasInteractiveTarget(event.target),
    }

    pendingDragRef.current = nextPendingState

    if (event.pointerType === MOUSE_POINTER_TYPE && !nextPendingState.wasOverInteractiveTarget) {
      // The heavy activation work used to re-render the whole GameView/board, which made
      // starting a drag stutter. The bottom hand row is now an isolated component and row
      // geometry is cached, so activating synchronously here is cheap AND keeps drag
      // starts deterministic (no cross-frame races between press/move/up).
      activateDrag(nextPendingState)
      return
    }

    if (nextPendingState.wasOverInteractiveTarget) {
      // The pointer went down on an interactive control (e.g. a card action button that
      // the hover overlay exposes). Simple clicks must still activate the control, so the
      // reorder drag is deferred until the pointer moves beyond the drag-intent tolerance.
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
      const movedBeyondTolerance = Math.hypot(deltaX, deltaY) > startMovementTolerancePx

      if (movedBeyondTolerance && pendingState.wasOverInteractiveTarget) {
        // Drag started on an interactive control; activation was deferred until the pointer
        // moved far enough to express a drag intent instead of a plain click on that control.
        activateDrag(pendingState)
      } else if (movedBeyondTolerance) {
        // Touch/pen drags that move before the long-press delay are treated as scrolls.
        clearPendingState()
      }
    }

    const dragState = dragPointerRef.current
    const rowElement = dragState?.rowElement ?? rowRef.current
    if (!dragState || dragState.pointerId !== pointerId || !rowElement) {
      return
    }

    positionDraggedCardElement(dragState, clientX, clientY)

    // The dragged card is taken out of flow (position: fixed), so the remaining cards'
    // layout stays constant for the whole drag. Snapshot the row geometry once and reuse
    // it instead of walking the DOM and forcing layout for every card on every pointer
    // frame (that was the main source of frame drops while dragging).
    let geometry = dragGeometryRef.current
    if (!geometry) {
      geometry = readDragRowGeometry(rowElement, dragState.cardInstanceId)
      dragGeometryRef.current = geometry
    }

    const isWithinVerticalBounds = clientY >= geometry.rowRect.top && clientY <= geometry.rowRect.bottom
    if (!isWithinVerticalBounds) {
      return
    }

    hasSeenValidReorderTargetRef.current = true
    const clampedClientX = clamp(clientX, geometry.rowRect.left, geometry.rowRect.right)

    const currentOrder = reconcileOrder(displayOrder, latestCardsRef.current)
    const currentIndex = currentOrder.indexOf(dragState.cardInstanceId)
    if (currentIndex < 0) {
      return
    }

    const nextIndex = resolveInsertionIndexFromGeometry(geometry.cards, clampedClientX, currentIndex)
    if (nextIndex === currentIndex) {
      return
    }

    setDisplayOrder((previousOrder) => {
      const reconciledPreviousOrder = reconcileOrder(previousOrder, latestCardsRef.current)
      const fromIndex = reconciledPreviousOrder.indexOf(dragState.cardInstanceId)
      if (fromIndex < 0) {
        return reconciledPreviousOrder
      }

      const boundedToIndex = Math.max(0, Math.min(nextIndex, reconciledPreviousOrder.length))
      if (fromIndex === boundedToIndex) {
        return reconciledPreviousOrder
      }

      const nextOrder = [...reconciledPreviousOrder]
      const [movedId] = nextOrder.splice(fromIndex, 1)
      nextOrder.splice(boundedToIndex, 0, movedId)
      return nextOrder
    })
  }, [activateDrag, clearPendingState, displayOrder, rowRef, startMovementTolerancePx])

  useEffect(() => {
    handlePointerMoveRef.current = handlePointerMove
  }, [handlePointerMove])

  const flushScheduledPointerMove = useCallback(() => {
    moveRafIdRef.current = null

    const pendingMove = pendingPointerMoveRef.current
    pendingPointerMoveRef.current = null
    if (!pendingMove) {
      return
    }

    handlePointerMoveRef.current(pendingMove.pointerId, pendingMove.clientX, pendingMove.clientY)
  }, [])

  const handlePointerUp = useCallback((pointerId: number, clientX: number, clientY: number) => {
    const pendingState = pendingDragRef.current
    if (pendingState && pendingState.pointerId === pointerId) {
      const deltaX = clientX - pendingState.start.x
      const deltaY = clientY - pendingState.start.y
      const movedBeyondTolerance = Math.hypot(deltaX, deltaY) > startMovementTolerancePx
      const qualifiesAsDragIntent = pendingState.pointerType === MOUSE_POINTER_TYPE || pendingState.wasOverInteractiveTarget

      if (movedBeyondTolerance && qualifiesAsDragIntent) {
        // The pointer was released before the scheduled move frame could activate the
        // drag (e.g. a very fast drag). Commit the drag intent and process the release
        // point through the move pipeline so the insertion index is still computed and
        // the drop finalizes deterministically.
        activateDrag(pendingState)
        handlePointerMoveRef.current(pointerId, clientX, clientY)
      }

      clearPendingState()
    }

    const activeDragState = dragPointerRef.current
    const rowElement = activeDragState?.rowElement ?? rowRef.current
    if (activeDragState && activeDragState.pointerId === pointerId && rowElement) {
      // Fast releases can arrive before the scheduled move frame runs, which would make
      // the drop finalize without the reorder ever being computed. Re-running the move
      // pipeline with the release coordinates is idempotent when it already ran and
      // guarantees the insertion index is applied before the drop finalizes.
      handlePointerMoveRef.current(pointerId, clientX, clientY)

      const hasValidDrop = isPointerInsideElement(rowElement, clientX, clientY) || hasSeenValidReorderTargetRef.current
      if (hasValidDrop) {
        finalizeValidDrop(pointerId, activeDragState)
      } else {
        finalizeInvalidDrop(pointerId, activeDragState)
      }

      armClickSuppression()
      return
    }

    finalizeDrag(pointerId)
  }, [activateDrag, armClickSuppression, clearPendingState, finalizeDrag, finalizeInvalidDrop, finalizeValidDrop, rowRef, startMovementTolerancePx])

  const handlePointerCancel = useCallback((pointerId: number) => {
    if (pendingDragRef.current?.pointerId === pointerId) {
      clearPendingState()
    }

    const activeDragState = dragPointerRef.current
    if (activeDragState && activeDragState.pointerId === pointerId) {
      finalizeInvalidDrop(pointerId, activeDragState)
      armClickSuppression()
      return
    }

    finalizeDrag(pointerId)
  }, [armClickSuppression, clearPendingState, finalizeDrag, finalizeInvalidDrop])

  useEffect(() => {
    function handleWindowPointerMove(event: PointerEvent): void {
      if (!dragPointerRef.current && !pendingDragRef.current) {
        return
      }

      event.preventDefault()
      // Coalesce high-frequency pointer moves into a single update per animation
      // frame so dragging only does DOM/layout/render work once per frame.
      pendingPointerMoveRef.current = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
      }

      if (moveRafIdRef.current === null) {
        moveRafIdRef.current = window.requestAnimationFrame(flushScheduledPointerMove)
      }
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
  }, [flushScheduledPointerMove, handlePointerCancel, handlePointerUp])

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