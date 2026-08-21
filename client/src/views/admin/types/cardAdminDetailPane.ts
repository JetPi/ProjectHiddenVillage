import type { ICardCatalogItemResponse } from '@/types/cardCatalog'

export type ICardAdminDetailPaneProps = {
  selectedCard: ICardCatalogItemResponse | null
}

export type ICardAdminDetailEditorProps = {
  selectedCard: ICardCatalogItemResponse
}
