import type { ICardCatalogItemResponse } from '@/types/cardCatalog'
import type { ICardCatalogPageQuery } from '@/services/api/types/cardCatalog'
import type { ICreateCardRequest } from '@/services/api/types/cardCatalog'
import type { IUpdateCardCatalogEffectsRequest } from '@/services/api/types/cardCatalog'

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

export type IUpdateCardCatalogEffectsMutationVariables = {
  cardId: string
  payload: IUpdateCardCatalogEffectsRequest
}

export type ICreateCardCatalogEntryMutationVariables = {
  payload: ICreateCardRequest
}

export type IDeleteCardCatalogEntryMutationVariables = {
  cardId: string
  /** True also removes the card from the decks that list it; the server refuses otherwise. */
  force: boolean
}

export type IUpdateCardCatalogImageMutationVariables = {
  cardId: string
  /** An external URL, a local art reference, or an empty string to clear the art. */
  image: string
}
