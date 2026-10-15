import type { ReactNode, RefCallback } from 'react'
import type { IHandRowReorderProps } from '@/views/game/types/hands/handReorder'

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
  /**
   * Present when the row is reorderable (Motion `Reorder` owns the cards' positions). Absent for the
   * opponent's hand, which is render-only.
   */
  reorder?: IHandRowReorderProps<TCard>
  footer?: ReactNode
  footerClassName?: string
}
