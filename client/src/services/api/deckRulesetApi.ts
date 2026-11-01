import { api } from '@/services/api/httpClient'
import type {
  ICreateDeckRulesetRequest,
  IDeckRuleset,
  IDeckRulesetSetCode,
  IUpdateDeckRulesetRequest,
} from '@/types/deckRuleset'

export async function fetchActiveDeckRulesets(): Promise<IDeckRuleset[]> {
  const { data } = await api.get<IDeckRuleset[]>('/api/deck-rulesets')
  return data
}

export async function fetchAllDeckRulesets(): Promise<IDeckRuleset[]> {
  const { data } = await api.get<IDeckRuleset[]>('/api/deck-rulesets/all')
  return data
}

export async function createDeckRuleset(
  request: ICreateDeckRulesetRequest,
): Promise<IDeckRuleset> {
  const { data } = await api.post<IDeckRuleset>('/api/deck-rulesets', request)
  return data
}

export async function updateDeckRuleset(
  rulesetId: string,
  request: IUpdateDeckRulesetRequest,
): Promise<IDeckRuleset> {
  const { data } = await api.put<IDeckRuleset>(
    `/api/deck-rulesets/${encodeURIComponent(rulesetId)}`,
    request,
  )

  return data
}

export async function deleteDeckRuleset(rulesetId: string): Promise<void> {
  await api.delete(`/api/deck-rulesets/${encodeURIComponent(rulesetId)}`)
}

/**
 * Saves the rail's display order: the format ids in the order they now appear. One drop is one request, and ids
 * the server does not recognise are ignored there.
 */
export async function reorderDeckRulesets(rulesetIds: string[]): Promise<IDeckRuleset[]> {
  const { data } = await api.put<IDeckRuleset[]>('/api/deck-rulesets/order', { rulesetIds })
  return data
}

/**
 * The set codes the catalogue holds, with card counts. Admin-only, because it exists to feed the rule editor with
 * real set codes instead of making the admin guess them.
 */
export async function fetchDeckRulesetSetCodes(): Promise<IDeckRulesetSetCode[]> {
  const { data } = await api.get<IDeckRulesetSetCode[]>('/api/deck-rulesets/card-pool/set-codes')
  return data
}
