import { useCallback, useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { Reorder, useDragControls } from 'motion/react'
import { twMerge } from 'tailwind-merge'

/**
 * One hand-row slot, owned by Motion's `Reorder`.
 *
 * The drag moves this element with a `transform` while it stays in flow, and Motion lays the other slots out by
 * projection - one writer for the geometry, and no ancestor containing-block trap. The previous engine lifted
 * the card with `position: fixed`, which a transformed ancestor (this Motion slot) turns into a lie: the card
 * was measured 566px below the pointer (see `plans/board-position-fixes.md`).
 *
 * A drag is armed from the pointer press: immediately for a mouse press, and after a hold for touch/pen so a
 * scroll gesture is never mistaken for a drag. A press that lands on a control is left alone, so card buttons
 * keep working.
 */

const LONG_PRESS_DELAY_MS = 260
const LONG_PRESS_MOVE_TOLERANCE_PX = 14
const INTERACTIVE_TARGET_SELECTOR = 'button,[role="button"],[data-prevent-hand-drag="true"]'

type IHandCardItemProps = {
  value: string
  isDraggable: boolean
  isActive: boolean
  className?: string
  onDragStateChange: (instanceId: string | null) => void
  children: ReactNode
}

function HandCardItem({
  value,
  isDraggable,
  isActive,
  className,
  onDragStateChange,
  children,
}: IHandCardItemProps) {
  const dragControls = useDragControls()
  const longPressTimerRef = useRef<number | null>(null)
  const pendingPressRef = useRef<{
    event: ReactPointerEvent<HTMLDivElement>
    x: number
    y: number
    pointerId: number
  } | null>(null)

  const cancelPendingLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }

    pendingPressRef.current = null
  }, [])

  useEffect(() => cancelPendingLongPress, [cancelPendingLongPress])

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDraggable) {
      return
    }

    const target = event.target
    if (target instanceof Element && target.closest(INTERACTIVE_TARGET_SELECTOR)) {
      return
    }

    if (event.pointerType === 'mouse') {
      dragControls.start(event)
      return
    }

    pendingPressRef.current = {
      event,
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
    }
    longPressTimerRef.current = window.setTimeout(() => {
      const pendingPress = pendingPressRef.current
      longPressTimerRef.current = null
      pendingPressRef.current = null
      if (pendingPress) {
        dragControls.start(pendingPress.event)
      }
    }, LONG_PRESS_DELAY_MS)
  }, [dragControls, isDraggable])

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const pendingPress = pendingPressRef.current
    if (!pendingPress || pendingPress.pointerId !== event.pointerId) {
      return
    }

    const movedBeyondTolerance =
      Math.hypot(event.clientX - pendingPress.x, event.clientY - pendingPress.y) > LONG_PRESS_MOVE_TOLERANCE_PX
    if (movedBeyondTolerance) {
      // Touch/pen movement before the hold is a scroll, not a drag.
      cancelPendingLongPress()
    }
  }, [cancelPendingLongPress])

  return (
    <Reorder.Item
      as="div"
      value={value}
      dragListener={false}
      dragControls={dragControls}
      onDragStart={() => onDragStateChange(value)}
      onDragEnd={() => onDragStateChange(null)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      // No entrance or exit animation: a hand card's arrival and departure are *flights* that move the card
      // itself, and a mount fade running at the same time was measured doing both at once - the card fading in
      // at its resting spot (up to 223ms, fully opaque) while the flight carried it in from the deck. Motion
      // stays the owner of the drag and of the reorder projection; it is not a second arrival animation.
      className={twMerge(className, isActive ? 'z-[260] touch-none' : 'touch-manipulation')}
    >
      {children}
    </Reorder.Item>
  )
}

export { HandCardItem }
