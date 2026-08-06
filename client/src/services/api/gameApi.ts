import { api } from './httpClient'

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