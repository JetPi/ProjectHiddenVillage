import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createPublicDeck,
  deleteDeck,
  fetchDeck,
  fetchDecks,
  updateDeck,
} from '@/services/api/deckApi'
import { DEFAULT_CARD_CATALOG_STALE_TIME_MS } from '@/services/queryClient'
import type { IDeckCardInput, IDeckResponse } from '@/types/deck'
import type { IFetchDecksQuery } from '@/services/api/types/deck'

export const deckQueryKeys = {
  all: ['decks'] as const,
  list: (query: IFetchDecksQuery) =>
    [
      'decks',
      'list',
      query.type ?? 'all',
      query.userId ?? 'all',
      query.populate === true ? 'populated' : 'lean',
    ] as const,
  detail: (deckId: string) => ['decks', 'detail', deckId.trim().toLowerCase()] as const,
}

export type IUseDecksQueryOptions = {
  enabled?: boolean
}

export function useDecksQuery(query: IFetchDecksQuery = {}, options: IUseDecksQueryOptions = {}) {
  return useQuery<IDeckResponse[]>({
    queryKey: deckQueryKeys.list(query),
    queryFn: () => fetchDecks(query),
    enabled: options.enabled ?? true,
    staleTime: DEFAULT_CARD_CATALOG_STALE_TIME_MS,
  })
}

export function useDeckQuery(deckId: string | null | undefined, options: { populate?: boolean; enabled?: boolean } = {}) {
  const normalizedDeckId = deckId?.trim() ?? ''

  return useQuery<IDeckResponse>({
    queryKey: deckQueryKeys.detail(normalizedDeckId),
    queryFn: () => fetchDeck(normalizedDeckId, options.populate ?? false),
    enabled: (options.enabled ?? true) && normalizedDeckId.length > 0,
    staleTime: DEFAULT_CARD_CATALOG_STALE_TIME_MS,
  })
}

export type ICreatePublicDeckMutationVariables = {
  name: string
  cards: IDeckCardInput[]
}

export type IUpdateDeckMutationVariables = {
  deckId: string
  name: string
  cards: IDeckCardInput[]
}

function invalidateDeckQueries(queryClient: ReturnType<typeof useQueryClient>): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: deckQueryKeys.all, exact: false })
}

export function useCreatePublicDeckMutation() {
  const queryClient = useQueryClient()

  return useMutation<IDeckResponse, Error, ICreatePublicDeckMutationVariables>({
    mutationFn: ({ name, cards }) => createPublicDeck(name, cards),
    onSuccess: async () => {
      await invalidateDeckQueries(queryClient)
    },
  })
}

export function useUpdateDeckMutation() {
  const queryClient = useQueryClient()

  return useMutation<IDeckResponse, Error, IUpdateDeckMutationVariables>({
    mutationFn: ({ deckId, name, cards }) => updateDeck(deckId, name, cards),
    onSuccess: async () => {
      await invalidateDeckQueries(queryClient)
    },
  })
}

export function useDeleteDeckMutation() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, string>({
    mutationFn: (deckId) => deleteDeck(deckId),
    onSuccess: async () => {
      await invalidateDeckQueries(queryClient)
    },
  })
}
