import type { RefObject } from 'react'
import type { ICardCatalogItemResponse } from '@/types/cardCatalog'

export type ICardAdminCatalogPaneProps = {
  cards: ICardCatalogItemResponse[]
  selectedCardId: string | null
  isLoading: boolean
  isError: boolean
  isFetchingNextPage: boolean
  hasNextPage: boolean
  onSelectCard: (cardId: string) => void
  onFetchNextPage: () => void | Promise<unknown>
  listScrollContainerRef: RefObject<HTMLDivElement | null>
  loadMoreSentinelRef: RefObject<HTMLDivElement | null>
}
