import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ICardCatalogItemResponse } from '../../types/cardCatalog'
import { fetchCardCatalogByIdsSparseCached } from '../api/cardCatalogApi'
import { fetchGameCards } from '../api/gameApi'
import { DEFAULT_CARD_CATALOG_STALE_TIME_MS } from '../queryClient'

function normalizeCardIds(cardIds: string[]): string[] {
  const uniqueCardIds = new Map<string, string>()

  for (const cardId of cardIds) {
    const trimmedCardId = cardId.trim()
    if (!trimmedCardId) {
      continue
    }

    const normalizedCardId = trimmedCardId.toLowerCase()
    if (!uniqueCardIds.has(normalizedCardId)) {
      uniqueCardIds.set(normalizedCardId, trimmedCardId)
    }
  }

  return Array.from(uniqueCardIds.values()).sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: 'base' }),
  )
}

function buildCardIdsKey(cardIds: string[]): string {
  return normalizeCardIds(cardIds)
    .map((cardId) => cardId.toLowerCase())
    .join('|')
}

export const cardQueryKeys = {
  all: ['cards'] as const,
  byIds: (cardIds: string[]) => ['cards', 'by-ids', buildCardIdsKey(cardIds)] as const,
  gameCards: (joinCode: string) => ['cards', 'game', joinCode.trim().toLowerCase()] as const,
}

type IUseCardCatalogByIdsQueryOptions = {
  enabled?: boolean
  staleTimeMs?: number
}

export function useCardCatalogByIdsQuery(
  cardIds: string[],
  options: IUseCardCatalogByIdsQueryOptions = {},
) {
  const normalizedCardIds = useMemo(() => normalizeCardIds(cardIds), [cardIds])
  const staleTimeMs = options.staleTimeMs ?? DEFAULT_CARD_CATALOG_STALE_TIME_MS

  return useQuery<ICardCatalogItemResponse[]>({
    queryKey: cardQueryKeys.byIds(normalizedCardIds),
    queryFn: () => fetchCardCatalogByIdsSparseCached(normalizedCardIds, staleTimeMs),
    enabled: (options.enabled ?? true) && normalizedCardIds.length > 0,
    staleTime: staleTimeMs,
  })
}

type IUseGameCardsQueryOptions = {
  enabled?: boolean
  staleTimeMs?: number
  refetchIntervalMs?: number
}

export function useGameCardsQuery(
  joinCode: string | undefined,
  options: IUseGameCardsQueryOptions = {},
) {
  const normalizedJoinCode = joinCode?.trim() ?? ''
  const staleTimeMs = options.staleTimeMs ?? 4_000

  return useQuery<ICardCatalogItemResponse[]>({
    queryKey: cardQueryKeys.gameCards(normalizedJoinCode),
    queryFn: () => fetchGameCards(normalizedJoinCode),
    enabled: (options.enabled ?? true) && normalizedJoinCode.length > 0,
    staleTime: staleTimeMs,
    refetchInterval: options.refetchIntervalMs,
  })
}

type IUseGameCardMapByIdResult = {
  cardsById: Map<string, ICardCatalogItemResponse>
  getCardById: (cardId: string | null | undefined) => ICardCatalogItemResponse | undefined
}

export function useGameCardMapById(
  joinCode: string | undefined,
  options: IUseGameCardsQueryOptions = {},
): IUseGameCardMapByIdResult {
  const queryResult = useGameCardsQuery(joinCode, options)

  const cardsById = useMemo(() => {
    const nextMap = new Map<string, ICardCatalogItemResponse>()

    for (const card of queryResult.data ?? []) {
      const normalizedCardId = card.id.trim().toLowerCase()
      if (!normalizedCardId || nextMap.has(normalizedCardId)) {
        continue
      }

      nextMap.set(normalizedCardId, card)
    }

    return nextMap
  }, [queryResult.data])

  const getCardById = (cardId: string | null | undefined): ICardCatalogItemResponse | undefined => {
    const normalizedCardId = cardId?.trim().toLowerCase() ?? ''
    if (!normalizedCardId) {
      return undefined
    }

    return cardsById.get(normalizedCardId)
  }

  return {
    cardsById,
    getCardById,
  }
}
