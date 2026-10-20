import { api } from '@/services/api/httpClient'
import type { IDeckCardInput, IDeckResponse } from '@/types/deck'
import type {
  ICreateDeckRequest,
  ICreatePublicDeckRequest,
  IFetchDecksQuery,
  IUpdateDeckRequest,
} from '@/services/api/types/deck'

const DECK_TYPE_USER = 1

/**
 * The legacy text import a player uses at game creation. Unchanged: the server keeps its own parser and its own
 * rules for that path, so the structured admin write below is a separate endpoint rather than a wider body here.
 */
export async function createUserDeck(cards: string, userId: string): Promise<string> {
  const payload: ICreateDeckRequest = {
    type: DECK_TYPE_USER,
    cards,
    userId,
  }

  const { data } = await api.post<string>('/api/deck', payload)
  return data
}

/** Creates an admin-authored public deck. The server enforces the deck rules and answers 400 with the first. */
export async function createPublicDeck(name: string, cards: IDeckCardInput[]): Promise<IDeckResponse> {
  const payload: ICreatePublicDeckRequest = { name, cards }

  const { data } = await api.post<IDeckResponse>('/api/deck/public', payload)
  return data
}

/** Replaces a deck's name and card lines. The deck's type and owner are never part of the update. */
export async function updateDeck(deckId: string, name: string, cards: IDeckCardInput[]): Promise<IDeckResponse> {
  const payload: IUpdateDeckRequest = { name, cards }

  const { data } = await api.put<IDeckResponse>(`/api/deck/${encodeURIComponent(deckId)}`, payload)
  return data
}

/** Deletes a deck. A deck a game instance still points at answers 409 and stays put. */
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
