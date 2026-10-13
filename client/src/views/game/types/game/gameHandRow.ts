import type { ReactNode, RefCallback } from 'react'

export type IGameHandRowProps<TCard> = {
  cards: TCard[]
  rowRef: RefCallback<HTMLDivElement>
  renderCard: (card: TCard, index: number) => ReactNode
  /** Stable identity for each card, so Motion can animate a card's enter/exit and its slot. */
  getCardKey: (card: TCard, index: number) => string
  rowTestId?: string
  containerClassName?: string
  rowClassName?: string
  cardsContainerClassName?: string
  /** Off while the reorder engine owns card positions (see `useLongPressHandReorder`). */
  isLayoutAnimationEnabled?: boolean
  footer?: ReactNode
  footerClassName?: string
}