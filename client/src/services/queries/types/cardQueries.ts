import type { ICardCatalogItemResponse } from '@/types/cardCatalog'
import type { ICardCatalogPageQuery } from '@/services/api/types/cardCatalog'
import type { ICreateCardRequest } from '@/services/api/types/cardCatalog'
import type { IUpdateCardCatalogEffectsRequest } from '@/services/api/types/cardCatalog'

export type IUseCardCatalogByIdsQueryOptions = {
  enabled?: boolean
  staleTimeMs?: number
}

export type IUseInfiniteCardCatalogQueryOptions = {
  enabled?: boolean
  staleTimeMs?: number
}

export type IUseInfiniteCardCatalogQueryParams = Pick<
  ICardCatalogPageQuery,
  'pageSize' | 'sort' | 'search' | 'types' | 'colors'
>

export type IUseGameCardsQueryOptions = {
  enabled?: boolean
  staleTimeMs?: number
  refetchIntervalMs?: number
}

export type IUseGameCardMapByIdResult = {
  cardsById: Map<string, ICardCatalogItemResponse>
  getCardById: (cardId: string | null | undefined) => ICardCatalogItemResponse | undefined
}

export type IUpdateCardCatalogEffectsMutationVariables = {
  cardId: string
  payload: IUpdateCardCatalogEffectsRequest
}

export type ICreateCardCatalogEntryMutationVariables = {
  payload: ICreateCardRequest
}

export type IDeleteCardCatalogEntryMutationVariables = {
  cardId: string
  force: boolean
}

export type IUpdateCardCatalogImageMutationVariables = {
  cardId: string
  image: string
}
