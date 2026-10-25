import { api } from '@/services/api/httpClient'
import type { IDeckCardInput, IDeckResponse } from '@/types/deck'
import type {
  ICreateDeckRequest,
  ICreatePublicDeckRequest,
  IFetchDecksQuery,
  IUpdateDeckRequest,
} from '@/services/api/types/deck'

const DECK_TYPE_USER = 1

export async function createUserDeck(cards: string, userId: string, name?: string): Promise<string> {
  const payload: ICreateDeckRequest = {
    type: DECK_TYPE_USER,
    cards,
    userId,
    ...(name?.trim() ? { name: name.trim() } : {}),
  }

  const { data } = await api.post<string>('/api/deck', payload)
  return data
}

export async function createPublicDeck(name: string, cards: IDeckCardInput[]): Promise<IDeckResponse> {
  const payload: ICreatePublicDeckRequest = { name, cards }

  const { data } = await api.post<IDeckResponse>('/api/deck/public', payload)
  return data
}

export async function updateDeck(deckId: string, name: string, cards: IDeckCardInput[]): Promise<IDeckResponse> {
  const payload: IUpdateDeckRequest = { name, cards }

  const { data } = await api.put<IDeckResponse>(`/api/deck/${encodeURIComponent(deckId)}`, payload)
  return data
}

export async function deleteDeck(deckId: string): Promise<void> {
  await api.delete(`/api/deck/${encodeURIComponent(deckId)}`)
}

export async function fetchDeck(deckId: string, populate = false): Promise<IDeckResponse> {
  const { data } = await api.get<IDeckResponse>(`/api/deck/${encodeURIComponent(deckId)}`, {
    params: { populate },
  })

  return data
}

export async function fetchDecks(query: IFetchDecksQuery = {}): Promise<IDeckResponse[]> {
  const { data } = await api.get<IDeckResponse[]>('/api/deck', {
    params: query,
  })

  return data
}
