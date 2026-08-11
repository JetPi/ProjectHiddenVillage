import type { ICardCatalogItemResponse } from '../../../types/cardCatalog'

export type IUseCardCatalogByIdsQueryOptions = {
  enabled?: boolean
  staleTimeMs?: number
}

export type IUseGameCardsQueryOptions = {
  enabled?: boolean
  staleTimeMs?: number
  refetchIntervalMs?: number
}

export type IUseGameCardMapByIdResult = {
  cardsById: Map<string, ICardCatalogItemResponse>
  getCardById: (cardId: string | null | undefined) => ICardCatalogItemResponse | undefined
}
