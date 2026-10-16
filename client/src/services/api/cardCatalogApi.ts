import { api } from '@/services/api/httpClient'
import type {
  ICardCatalogItemResponse,
  ICardDeletionImpactResponse,
  IPagedResponse,
} from '@/types/cardCatalog'
import { appQueryClient, DEFAULT_CARD_CATALOG_STALE_TIME_MS } from '@/services/queryClient'
import type {
  ICardCatalogPageQuery,
  ICreateCardRequest,
  IUpdateCardCatalogEffectsRequest,
} from '@/services/api/types/cardCatalog'

const CARD_CATALOG_CACHE_TTL_MS = DEFAULT_CARD_CATALOG_STALE_TIME_MS

function sanitizeRequestedCardIds(cardIds: string[]): string[] {
  return cardIds
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
}

function normalizeCardIdsForCacheKey(cardIds: string[]): string[] {
  const normalized = cardIds.map((id) => id.toLowerCase())

  return Array.from(new Set(normalized)).sort((left, right) => left.localeCompare(right))
}

function sanitizeUniqueRequestedCardIds(cardIds: string[]): string[] {
  const seen = new Set<string>()
  const uniqueIds: string[] = []

  for (const requestedId of sanitizeRequestedCardIds(cardIds)) {
    const normalizedId = toNormalizedCardId(requestedId)
    if (!normalizedId || seen.has(normalizedId)) {
      continue
    }

    seen.add(normalizedId)
    uniqueIds.push(requestedId)
  }

  return uniqueIds
}

function toNormalizedCardId(cardId: string): string {
  return cardId.trim().toLowerCase()
}

function getCardCatalogByIdsQueryKey(cardIds: string[]): readonly [string, string, string] {
  return ['card-catalog', 'by-ids', normalizeCardIdsForCacheKey(cardIds).join('|')] as const
}

function getCardCatalogByIdQueryKey(cardId: string): readonly [string, string, string] {
  return ['card-catalog', 'by-id', toNormalizedCardId(cardId)] as const
}

function setCardItemQueryCache(cards: ICardCatalogItemResponse[]): void {
  for (const card of cards) {
    const normalizedId = toNormalizedCardId(card.id)
    if (!normalizedId) {
      continue
    }

    appQueryClient.setQueryData(getCardCatalogByIdQueryKey(normalizedId), card)
  }
}

function getFreshCardItemFromCache(cardId: string, ttlMs: number): ICardCatalogItemResponse | undefined {
  const normalizedCardId = toNormalizedCardId(cardId)
  if (!normalizedCardId) {
    return undefined
  }

  const queryKey = getCardCatalogByIdQueryKey(normalizedCardId)
  const queryState = appQueryClient.getQueryState<ICardCatalogItemResponse>(queryKey)
  if (!queryState?.data) {
    return undefined
  }

  const staleAt = queryState.dataUpdatedAt + Math.max(0, ttlMs)
  if (Date.now() >= staleAt) {
    return undefined
  }

  return queryState.data
}

export async function fetchCardCatalogPage(
  query: ICardCatalogPageQuery = {},
): Promise<IPagedResponse<ICardCatalogItemResponse>> {
  const { data } = await api.get<IPagedResponse<ICardCatalogItemResponse>>('/api/card/catalog', {
    params: query,
  })

  return data
}

export async function fetchCardCatalogByIds(cardIds: string[]): Promise<ICardCatalogItemResponse[]> {
  const { data } = await api.post<ICardCatalogItemResponse[]>('/api/card/catalog/by-ids', cardIds)

  return data
}

export async function fetchCardCatalogEffectConditionKeywords(): Promise<string[]> {
  const { data } = await api.get<string[]>('/api/card/catalog/effect-condition-keywords')
  return data
}

export async function createCardCatalogEntry(
  request: ICreateCardRequest,
): Promise<ICardCatalogItemResponse> {
  const { data } = await api.post<ICardCatalogItemResponse>('/api/card/catalog', request)

  appQueryClient.setQueryData(getCardCatalogByIdQueryKey(data.id), data)
  return data
}

/**
 * Removes a card from the catalogue. Without `force` the server refuses while anything still references the card,
 * so the caller can show what is in the way before agreeing.
 */
export async function deleteCardCatalogEntry(
  cardId: string,
  force = false,
): Promise<ICardDeletionImpactResponse> {
  const { data } = await api.delete<ICardDeletionImpactResponse>(
    `/api/card/catalog/${encodeURIComponent(cardId)}`,
    { params: { force } },
  )

  // The card is gone, so its cached copy must go too: anything still asking for it by id would otherwise be
  // served a card that no longer exists.
  appQueryClient.removeQueries({
    queryKey: getCardCatalogByIdQueryKey(cardId),
    exact: true,
  })

  return data
}

export async function updateCardCatalogImage(
  cardId: string,
  image: string,
): Promise<ICardCatalogItemResponse> {
  const { data } = await api.put<ICardCatalogItemResponse>(
    `/api/card/catalog/${encodeURIComponent(cardId)}/image`,
    { image },
  )

  appQueryClient.setQueryData(getCardCatalogByIdQueryKey(cardId), data)
  return data
}

export async function updateCardCatalogEffects(
  cardId: string,
  request: IUpdateCardCatalogEffectsRequest,
): Promise<ICardCatalogItemResponse> {
  const { data } = await api.patch<ICardCatalogItemResponse>(
    `/api/card/catalog/${encodeURIComponent(cardId)}/effects`,
    request,
  )

  appQueryClient.setQueryData(getCardCatalogByIdQueryKey(cardId), data)
  return data
}

export async function fetchCardCatalogByIdsCached(
  cardIds: string[],
  ttlMs: number = CARD_CATALOG_CACHE_TTL_MS,
): Promise<ICardCatalogItemResponse[]> {
  const requestedIds = sanitizeUniqueRequestedCardIds(cardIds)
  if (requestedIds.length === 0) {
    return []
  }

  const cards = await appQueryClient.fetchQuery({
    queryKey: getCardCatalogByIdsQueryKey(requestedIds),
    queryFn: () => fetchCardCatalogByIds(requestedIds),
    staleTime: Math.max(0, ttlMs),
  })

  setCardItemQueryCache(cards)

  return cards
}

export function getMissingCardCatalogIds(cardIds: string[]): string[] {
  const requestedIds = sanitizeUniqueRequestedCardIds(cardIds)
  if (requestedIds.length === 0) {
    return []
  }

  const missingByNormalizedId = new Map<string, string>()

  for (const requestedId of requestedIds) {
    const normalizedCardId = toNormalizedCardId(requestedId)
    if (!normalizedCardId || missingByNormalizedId.has(normalizedCardId)) {
      continue
    }

    const cachedCard = getFreshCardItemFromCache(requestedId, CARD_CATALOG_CACHE_TTL_MS)
    if (!cachedCard) {
      missingByNormalizedId.set(normalizedCardId, requestedId)
    }
  }

  return Array.from(missingByNormalizedId.values())
}

export async function fetchCardCatalogByIdsSparseCached(
  cardIds: string[],
  ttlMs: number = CARD_CATALOG_CACHE_TTL_MS,
): Promise<ICardCatalogItemResponse[]> {
  const requestedIds = sanitizeUniqueRequestedCardIds(cardIds)
  if (requestedIds.length === 0) {
    return []
  }

  const requestedByNormalizedId = new Map<string, string>()

  for (const requestedId of requestedIds) {
    const normalizedCardId = toNormalizedCardId(requestedId)
    if (!normalizedCardId || requestedByNormalizedId.has(normalizedCardId)) {
      continue
    }

    requestedByNormalizedId.set(normalizedCardId, requestedId)
  }

  const cardsByNormalizedId = new Map<string, ICardCatalogItemResponse>()
  const missingIds: string[] = []

  for (const [normalizedCardId, requestedId] of requestedByNormalizedId.entries()) {
    const cachedCard = getFreshCardItemFromCache(requestedId, ttlMs)
    if (cachedCard) {
      cardsByNormalizedId.set(normalizedCardId, cachedCard)
      continue
    }

    missingIds.push(requestedId)
  }

  if (missingIds.length > 0) {
    const fetchedCards = await fetchCardCatalogByIdsCached(missingIds, ttlMs)
    setCardItemQueryCache(fetchedCards)

    for (const card of fetchedCards) {
      cardsByNormalizedId.set(toNormalizedCardId(card.id), card)
    }
  }

  const orderedCards: ICardCatalogItemResponse[] = []

  for (const normalizedCardId of requestedByNormalizedId.keys()) {
    const card = cardsByNormalizedId.get(normalizedCardId)
    if (card) {
      orderedCards.push(card)
    }
  }

  return orderedCards
}

export type {
  ICardCatalogPageQuery,
  ICreateCardRequest,
  IUpdateCardCatalogEffectsRequest,
}
