import { api } from './httpClient'
import type { DeckResponse } from '../../types/deck'

const DECK_TYPE_USER = 1

type CreateDeckRequest = {
  type: number
  cards: string
  userId: string
}

type FetchDecksQuery = {
  userId?: string
  populate?: boolean
}

export async function createUserDeck(cards: string, userId: string): Promise<string> {
  const payload: CreateDeckRequest = {
    type: DECK_TYPE_USER,
    cards,
    userId,
  }

  const { data } = await api.post<string>('/api/deck', payload)
  return data
}

export async function fetchDecks(query: FetchDecksQuery = {}): Promise<DeckResponse[]> {
  const { data } = await api.get<DeckResponse[]>('/api/deck', {
    params: query,
  })

  return data
}