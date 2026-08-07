import { api } from './httpClient'
import type { CardCatalogItemResponse } from '../../types/cardCatalog'

type CreateGameForUserRequest = {
  userId: string
  deckId: string
}

type JoinGameAsPlayerRequest = {
  userId: string
  deckId: string
}

type GameInstanceResponse = {
  id: string
}

export async function createGameForUser(request: CreateGameForUserRequest): Promise<GameInstanceResponse> {
  const { data } = await api.post<GameInstanceResponse>('/api/games', request)
  return data
}

export async function joinGameAsPlayer(
  gameCode: string,
  request: JoinGameAsPlayerRequest,
): Promise<GameInstanceResponse> {
  const { data } = await api.post<GameInstanceResponse>(`/api/games/${encodeURIComponent(gameCode)}/join`, request)
  return data
}

export async function fetchGameCards(gameCode: string): Promise<CardCatalogItemResponse[]> {
  const { data } = await api.get<CardCatalogItemResponse[]>(`/api/games/${encodeURIComponent(gameCode)}/cards`)
  return data
}