import type { ICardCatalogItemResponse } from '@/types/cardCatalog'

export type ICardAdminCardGridProps = {
  cards: ICardCatalogItemResponse[]
  selectedCardId: string | null
  onSelectCard: (cardId: string) => void
}
