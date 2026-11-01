import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createDeckRuleset,
  deleteDeckRuleset,
  fetchActiveDeckRulesets,
  fetchAllDeckRulesets,
  fetchDeckRulesetSetCodes,
  updateDeckRuleset,
} from '@/services/api/deckRulesetApi'
import { DEFAULT_CARD_CATALOG_STALE_TIME_MS } from '@/services/queryClient'
import type {
  ICreateDeckRulesetRequest,
  IDeckRuleset,
  IDeckRulesetSetCode,
  IUpdateDeckRulesetRequest,
} from '@/types/deckRuleset'

export const deckRulesetQueryKeys = {
  all: ['deck-rulesets'] as const,
  active: ['deck-rulesets', 'active'] as const,
  every: ['deck-rulesets', 'all'] as const,
  setCodes: ['deck-rulesets', 'set-codes'] as const,
}

export function useActiveDeckRulesetsQuery(options: { enabled?: boolean } = {}) {
  return useQuery<IDeckRuleset[]>({
    queryKey: deckRulesetQueryKeys.active,
    queryFn: fetchActiveDeckRulesets,
    enabled: options.enabled ?? true,
    staleTime: DEFAULT_CARD_CATALOG_STALE_TIME_MS,
  })
}

export function useAllDeckRulesetsQuery(options: { enabled?: boolean } = {}) {
  return useQuery<IDeckRuleset[]>({
    queryKey: deckRulesetQueryKeys.every,
    queryFn: fetchAllDeckRulesets,
    enabled: options.enabled ?? true,
    staleTime: DEFAULT_CARD_CATALOG_STALE_TIME_MS,
  })
}

/**
 * The set codes the catalogue holds. They change only when the catalogue does, so the ruleset admin can hold them
 * for the whole session; the ruleset mutations invalidate the key alongside every other ruleset query.
 */
export function useDeckRulesetSetCodesQuery(options: { enabled?: boolean } = {}) {
  return useQuery<IDeckRulesetSetCode[]>({
    queryKey: deckRulesetQueryKeys.setCodes,
    queryFn: fetchDeckRulesetSetCodes,
    enabled: options.enabled ?? true,
    staleTime: DEFAULT_CARD_CATALOG_STALE_TIME_MS,
  })
}

function invalidateDeckRulesetQueries(queryClient: ReturnType<typeof useQueryClient>): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: deckRulesetQueryKeys.all, exact: false })
}

export function useCreateDeckRulesetMutation() {
  const queryClient = useQueryClient()

  return useMutation<IDeckRuleset, Error, ICreateDeckRulesetRequest>({
    mutationFn: (request) => createDeckRuleset(request),
    onSuccess: async () => {
      await invalidateDeckRulesetQueries(queryClient)
    },
  })
}

export type IUpdateDeckRulesetMutationVariables = {
  rulesetId: string
  request: IUpdateDeckRulesetRequest
}

export function useUpdateDeckRulesetMutation() {
  const queryClient = useQueryClient()

  return useMutation<IDeckRuleset, Error, IUpdateDeckRulesetMutationVariables>({
    mutationFn: ({ rulesetId, request }) => updateDeckRuleset(rulesetId, request),
    onSuccess: async () => {
      await invalidateDeckRulesetQueries(queryClient)
    },
  })
}

export function useDeleteDeckRulesetMutation() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, string>({
    mutationFn: (rulesetId) => deleteDeckRuleset(rulesetId),
    onSuccess: async () => {
      await invalidateDeckRulesetQueries(queryClient)
    },
  })
}
