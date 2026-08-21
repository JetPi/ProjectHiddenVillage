import type { ICardCatalogItemResponse } from '@/types/cardCatalog'

export type ICardAdminCardTileProps = {
  card: ICardCatalogItemResponse
  isSelected: boolean
  onSelect: (cardId: string) => void
}
