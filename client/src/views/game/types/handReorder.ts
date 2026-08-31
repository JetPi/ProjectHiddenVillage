import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'

export type IHandReorderCard = {
  instanceId: string
}

export type IUseLongPressHandReorderArgs<TCard extends IHandReorderCard> = {
  cards: TCard[]
  rowRef: RefObject<HTMLDivElement | null>
  longPressDelayMs?: number
  startMovementTolerancePx?: number
}

export type ICardReorderPointerHandlers = {
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void
}

export type IUseLongPressHandReorderResult<TCard> = {
  orderedCards: TCard[]
  activeDraggedInstanceId: string | null
  isReorderDragging: boolean
  getCardPointerHandlers: (instanceId: string) => ICardReorderPointerHandlers
}

export type IPointerStartSnapshot = {
  x: number
  y: number
}

export type IDragPointerState = {
  pointerId: number
  cardInstanceId: string
  start: IPointerStartSnapshot
}

export type IElementStyleSnapshot = {
  position: string
  left: string
  top: string
  width: string
  height: string
  margin: string
  zIndex: string
  pointerEvents: string
  transition: string
  transform: string
  filter: string
}

export type IActiveDragState = {
  pointerId: number
  cardInstanceId: string
  start: IPointerStartSnapshot
  startOrder: string[]
  element: HTMLDivElement
  rowElement: HTMLDivElement | null
  styleSnapshot: IElementStyleSnapshot
}