import { api } from './httpClient'
import type { CardCatalogItemResponse, PagedResponse } from '../../types/cardCatalog'

const CARD_CATALOG_CACHE_TTL_MS = 120_000

type CardCatalogCacheEntry = {
  expiresAt: number
  cards: CardCatalogItemResponse[]
}

const cardCatalogByIdsCache = new Map<string, CardCatalogCacheEntry>()

function sanitizeRequestedCardIds(cardIds: string[]): string[] {
  return cardIds
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
}

function normalizeCardIdsForCacheKey(cardIds: string[]): string[] {
  const normalized = cardIds.map((id) => id.toLowerCase())

  return Array.from(new Set(normalized)).sort((left, right) => left.localeCompare(right))
}

function getCardCatalogCacheKey(cardIds: string[]): string {
  return normalizeCardIdsForCacheKey(cardIds).join('|')
}

export type CardCatalogPageQuery = {
  page?: number
  pageSize?: number
  sort?: string
}

export async function fetchCardCatalogPage(
  query: CardCatalogPageQuery = {},
): Promise<PagedResponse<CardCatalogItemResponse>> {
  const { data } = await api.get<PagedResponse<CardCatalogItemResponse>>('/api/card/catalog', {
    params: query,
  })

  return data
}

export async function fetchCardCatalogByIds(cardIds: string[]): Promise<CardCatalogItemResponse[]> {
  const { data } = await api.post<CardCatalogItemResponse[]>('/api/card/catalog/by-ids', cardIds)

  return data
}

export async function fetchCardCatalogByIdsCached(
  cardIds: string[],
  ttlMs: number = CARD_CATALOG_CACHE_TTL_MS,
): Promise<CardCatalogItemResponse[]> {
  const requestedIds = sanitizeRequestedCardIds(cardIds)
  if (requestedIds.length === 0) {
    return []
  }

  const cacheKey = getCardCatalogCacheKey(requestedIds)
  const now = Date.now()

  try {
    const cachedEntry = cardCatalogByIdsCache.get(cacheKey)
    if (cachedEntry && cachedEntry.expiresAt > now) {
      return cachedEntry.cards
    }

    if (cachedEntry && cachedEntry.expiresAt <= now) {
      cardCatalogByIdsCache.delete(cacheKey)
    }
  } catch {
    // Cache should never block API reads.
  }

  const cards = await fetchCardCatalogByIds(requestedIds)

  try {
    cardCatalogByIdsCache.set(cacheKey, {
      cards,
      expiresAt: now + Math.max(0, ttlMs),
    })
  } catch {
    // Ignore cache write failures and return the fresh result.
  }

  return cards
}
