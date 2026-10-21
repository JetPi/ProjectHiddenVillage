import type { ReactNode, RefCallback } from 'react'
import type { IHandRowReorderProps } from '@/views/game/types/hands/handReorder'

export type IGameHandRowProps<TCard> = {
  cards: TCard[]
  rowRef: RefCallback<HTMLDivElement>
  renderCard: (card: TCard, index: number) => ReactNode
  getCardKey: (card: TCard, index: number) => string
  rowTestId?: string
  containerClassName?: string
  rowClassName?: string
  cardsContainerClassName?: string
  reorder?: IHandRowReorderProps<TCard>
  footer?: ReactNode
  footerClassName?: string
}
