import type { ICardCatalogItemResponse } from '@/types/cardCatalog'
import type { ICardCatalogPageQuery } from '@/services/api/types/cardCatalog'

export type IUseCardCatalogByIdsQueryOptions = {
  enabled?: boolean
  staleTimeMs?: number
}

export type IUseCardCatalogPageQueryOptions = {
  enabled?: boolean
  staleTimeMs?: number
}

export type IUseCardCatalogPageQueryParams = ICardCatalogPageQuery

export type IUseInfiniteCardCatalogQueryOptions = {
  enabled?: boolean
  staleTimeMs?: number
}

export type IUseInfiniteCardCatalogQueryParams = Pick<ICardCatalogPageQuery, 'pageSize' | 'sort'>

export type IUseGameCardsQueryOptions = {
  enabled?: boolean
  staleTimeMs?: number
  refetchIntervalMs?: number
}

export type IUseGameCardMapByIdResult = {
  cardsById: Map<string, ICardCatalogItemResponse>
  getCardById: (cardId: string | null | undefined) => ICardCatalogItemResponse | undefined
}
