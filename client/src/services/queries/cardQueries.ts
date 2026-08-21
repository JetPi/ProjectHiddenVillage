import { useMemo } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import type { ICardCatalogItemResponse } from '@/types/cardCatalog'
import type { IPagedResponse } from '@/types/cardCatalog'
import { fetchCardCatalogByIdsSparseCached } from '@/services/api/cardCatalogApi'
import { fetchCardCatalogPage } from '@/services/api/cardCatalogApi'
import { fetchGameCards } from '@/services/api/gameApi'
import { DEFAULT_CARD_CATALOG_STALE_TIME_MS } from '@/services/queryClient'
import type {
  IUseCardCatalogByIdsQueryOptions,
  IUseInfiniteCardCatalogQueryOptions,
  IUseInfiniteCardCatalogQueryParams,
  IUseCardCatalogPageQueryOptions,
  IUseCardCatalogPageQueryParams,
  IUseGameCardMapByIdResult,
  IUseGameCardsQueryOptions,
} from '@/services/queries/types/cardQueries'

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

function normalizeCardCatalogPageParams(params: IUseCardCatalogPageQueryParams): Required<IUseCardCatalogPageQueryParams> {
  const normalizedPage = Number.isFinite(params.page) ? Math.max(1, Math.floor(params.page ?? 1)) : 1
  const normalizedPageSizeRaw = Number.isFinite(params.pageSize) ? Math.floor(params.pageSize ?? 100) : 100
  const normalizedPageSize = Math.min(100, Math.max(1, normalizedPageSizeRaw))
  const normalizedSort = params.sort?.trim() || 'cardId'

  return {
    page: normalizedPage,
    pageSize: normalizedPageSize,
    sort: normalizedSort,
  }
}

function normalizeInfiniteCardCatalogParams(
  params: IUseInfiniteCardCatalogQueryParams,
): Required<IUseInfiniteCardCatalogQueryParams> {
  const normalizedPageSizeRaw = Number.isFinite(params.pageSize) ? Math.floor(params.pageSize ?? 100) : 100
  const normalizedPageSize = Math.min(100, Math.max(1, normalizedPageSizeRaw))
  const normalizedSort = params.sort?.trim() || 'cardId'

  return {
    pageSize: normalizedPageSize,
    sort: normalizedSort,
  }
}

export const cardQueryKeys = {
  all: ['cards'] as const,
  byIds: (cardIds: string[]) => ['cards', 'by-ids', buildCardIdsKey(cardIds)] as const,
  gameCards: (joinCode: string) => ['cards', 'game', joinCode.trim().toLowerCase()] as const,
  catalogPage: (params: Required<IUseCardCatalogPageQueryParams>) =>
    ['cards', 'catalog', params.page, params.pageSize, params.sort] as const,
  catalogInfinite: (params: Required<IUseInfiniteCardCatalogQueryParams>) =>
    ['cards', 'catalog-infinite', params.pageSize, params.sort] as const,
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

export function useCardCatalogPageQuery(
  params: IUseCardCatalogPageQueryParams,
  options: IUseCardCatalogPageQueryOptions = {},
) {
  const normalizedParams = useMemo(() => normalizeCardCatalogPageParams(params), [params])
  const staleTimeMs = options.staleTimeMs ?? DEFAULT_CARD_CATALOG_STALE_TIME_MS

  return useQuery<IPagedResponse<ICardCatalogItemResponse>>({
    queryKey: cardQueryKeys.catalogPage(normalizedParams),
    queryFn: () => fetchCardCatalogPage(normalizedParams),
    enabled: options.enabled ?? true,
    staleTime: staleTimeMs,
  })
}

export function useInfiniteCardCatalogQuery(
  params: IUseInfiniteCardCatalogQueryParams,
  options: IUseInfiniteCardCatalogQueryOptions = {},
) {
  const normalizedParams = useMemo(() => normalizeInfiniteCardCatalogParams(params), [params])
  const staleTimeMs = options.staleTimeMs ?? DEFAULT_CARD_CATALOG_STALE_TIME_MS

  return useInfiniteQuery<IPagedResponse<ICardCatalogItemResponse>>({
    queryKey: cardQueryKeys.catalogInfinite(normalizedParams),
    queryFn: ({ pageParam }) => {
      const normalizedPageParam = typeof pageParam === 'number' && Number.isFinite(pageParam)
        ? Math.max(1, Math.floor(pageParam))
        : 1

      return fetchCardCatalogPage({
        page: normalizedPageParam,
        pageSize: normalizedParams.pageSize,
        sort: normalizedParams.sort,
      })
    },
    enabled: options.enabled ?? true,
    staleTime: staleTimeMs,
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.page >= lastPage.totalPages) {
        return undefined
      }

      return lastPage.page + 1
    },
  })
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
