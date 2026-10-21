import { useMemo } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ICardCatalogItemResponse } from '@/types/cardCatalog'
import type { ICardCatalogListItemResponse } from '@/types/cardCatalog'
import type { ICardDeletionImpactResponse } from '@/types/cardCatalog'
import type { IPagedResponse } from '@/types/cardCatalog'
import {
  fetchCardCatalogByIdsSparseCached,
  fetchCardCatalogTraits,
  seedCardCatalogItemCache,
} from '@/services/api/cardCatalogApi'
import { fetchCardCatalogPage } from '@/services/api/cardCatalogApi'
import { fetchGameCards } from '@/services/api/gameApi'
import { createCardCatalogEntry } from '@/services/api/cardCatalogApi'
import { deleteCardCatalogEntry } from '@/services/api/cardCatalogApi'
import { updateCardCatalogEffects } from '@/services/api/cardCatalogApi'
import { updateCardCatalogImage } from '@/services/api/cardCatalogApi'
import { DEFAULT_CARD_CATALOG_STALE_TIME_MS } from '@/services/queryClient'
import type {
  ICreateCardCatalogEntryMutationVariables,
  IDeleteCardCatalogEntryMutationVariables,
  IUpdateCardCatalogImageMutationVariables,
  IUseCardCatalogByIdsQueryOptions,
  IUseInfiniteCardCatalogQueryOptions,
  IUseInfiniteCardCatalogQueryParams,
  IUpdateCardCatalogEffectsMutationVariables,
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

function normalizeFilterValues(values: readonly string[] | undefined): string[] {
  const uniqueValues = new Map<string, string>()

  for (const value of values ?? []) {
    const normalizedValue = value.trim().toLowerCase()
    if (normalizedValue) {
      uniqueValues.set(normalizedValue, normalizedValue)
    }
  }

  return Array.from(uniqueValues.values()).sort((left, right) => left.localeCompare(right))
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
    search: params.search?.trim() ?? '',
    types: normalizeFilterValues(params.types),
    colors: normalizeFilterValues(params.colors),
  }
}

export const cardQueryKeys = {
  all: ['cards'] as const,
  traits: ['card-catalog', 'traits'] as const,
  byIds: (cardIds: string[]) => ['cards', 'by-ids', buildCardIdsKey(cardIds)] as const,
  byIdsRoot: ['cards', 'by-ids'] as const,
  gameCards: (joinCode: string) => ['cards', 'game', joinCode.trim().toLowerCase()] as const,
  catalogInfinite: (params: Required<IUseInfiniteCardCatalogQueryParams>) =>
    [
      'cards',
      'catalog-infinite',
      params.pageSize,
      params.sort,
      params.search,
      params.types.join(','),
      params.colors.join(','),
    ] as const,
}

export function useCardCatalogTraitsQuery(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: cardQueryKeys.traits,
    queryFn: fetchCardCatalogTraits,
    enabled: options.enabled ?? true,
    staleTime: DEFAULT_CARD_CATALOG_STALE_TIME_MS,
  })
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

export function useInfiniteCardCatalogQuery(
  params: IUseInfiniteCardCatalogQueryParams,
  options: IUseInfiniteCardCatalogQueryOptions = {},
) {
  const normalizedParams = useMemo(() => normalizeInfiniteCardCatalogParams(params), [params])
  const staleTimeMs = options.staleTimeMs ?? DEFAULT_CARD_CATALOG_STALE_TIME_MS

  return useInfiniteQuery<IPagedResponse<ICardCatalogListItemResponse>>({
    queryKey: cardQueryKeys.catalogInfinite(normalizedParams),
    queryFn: ({ pageParam }) => {
      const normalizedPageParam = typeof pageParam === 'number' && Number.isFinite(pageParam)
        ? Math.max(1, Math.floor(pageParam))
        : 1

      return fetchCardCatalogPage({
        page: normalizedPageParam,
        pageSize: normalizedParams.pageSize,
        sort: normalizedParams.sort,
        search: normalizedParams.search,
        types: normalizedParams.types,
        colors: normalizedParams.colors,
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

export function useCreateCardCatalogEntryMutation() {
  const queryClient = useQueryClient()

  return useMutation<ICardCatalogItemResponse, Error, ICreateCardCatalogEntryMutationVariables>({
    mutationFn: ({ payload }) => createCardCatalogEntry(payload),
    onSuccess: async (createdCard) => {
      seedCardCatalogItemCache([createdCard])

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: cardQueryKeys.byIdsRoot, exact: false }),
        queryClient.invalidateQueries({ queryKey: cardQueryKeys.traits, exact: true }),
        queryClient.invalidateQueries({
          queryKey: ['cards', 'catalog-infinite'],
          exact: false,
        }),
      ])
    },
  })
}

export function useUpdateCardCatalogImageMutation() {
  const queryClient = useQueryClient()

  return useMutation<ICardCatalogItemResponse, Error, IUpdateCardCatalogImageMutationVariables>({
    mutationFn: ({ cardId, image }) => updateCardCatalogImage(cardId, image),
    onSuccess: async (updatedCard) => {
      seedCardCatalogItemCache([updatedCard])

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: cardQueryKeys.byIdsRoot, exact: false }),
        queryClient.invalidateQueries({
          queryKey: ['cards', 'catalog-infinite'],
          exact: false,
        }),
      ])
    },
  })
}

export function useDeleteCardCatalogEntryMutation() {
  const queryClient = useQueryClient()

  return useMutation<ICardDeletionImpactResponse, Error, IDeleteCardCatalogEntryMutationVariables>({
    mutationFn: ({ cardId, force }) => deleteCardCatalogEntry(cardId, force),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['cards', 'catalog-infinite'], exact: false }),
        queryClient.invalidateQueries({ queryKey: cardQueryKeys.byIdsRoot, exact: false }),
        queryClient.invalidateQueries({ queryKey: ['card-catalog'], exact: false }),
      ])
    },
  })
}

export function useUpdateCardCatalogEffectsMutation() {
  const queryClient = useQueryClient()

  return useMutation<ICardCatalogItemResponse, Error, IUpdateCardCatalogEffectsMutationVariables>({
    mutationFn: ({ cardId, payload }) => updateCardCatalogEffects(cardId, payload),
    onSuccess: async (updatedCard) => {
      seedCardCatalogItemCache([updatedCard])

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: cardQueryKeys.byIdsRoot, exact: false }),
        queryClient.invalidateQueries({
          queryKey: ['cards', 'catalog-infinite'],
          exact: false,
        }),
      ])
    },
  })
}
