import type { ReactNode, RefCallback } from 'react'

export type IGameHandRowProps<TCard> = {
  cards: TCard[]
  rowRef: RefCallback<HTMLDivElement>
  renderCard: (card: TCard, index: number) => ReactNode
  containerClassName?: string
  rowClassName?: string
  cardsContainerClassName?: string
  footer?: ReactNode
  footerClassName?: string
}