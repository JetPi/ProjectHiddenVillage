import { api } from '@/services/api/httpClient'
import type { IDeckResponse } from '@/types/deck'
import type { ICreateDeckRequest, IFetchDecksQuery } from '@/services/api/types/deck'

const DECK_TYPE_USER = 1

export async function createUserDeck(cards: string, userId: string): Promise<string> {
  const payload: ICreateDeckRequest = {
    type: DECK_TYPE_USER,
    cards,
    userId,
  }

  const { data } = await api.post<string>('/api/deck', payload)
  return data
}

export async function fetchDecks(query: IFetchDecksQuery = {}): Promise<IDeckResponse[]> {
  const { data } = await api.get<IDeckResponse[]>('/api/deck', {
    params: query,
  })

  return data
}