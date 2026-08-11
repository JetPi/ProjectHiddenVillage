import { api } from './httpClient'
import type { ICardCatalogItemResponse } from '../../types/cardCatalog'
import type {
  ICreateGameForUserRequest,
  IGameInstanceResponse,
  IGameStateResponse,
  IJoinGameAsPlayerRequest,
} from './types/game'

export type {
  ICreateGameForUserRequest,
  IGameCardInstanceResponse,
  IGameInstanceDetailResponse,
  IGameInstanceResponse,
  IGamePlayerStateResponse,
  IGameStateResponse,
  IJoinGameAsPlayerRequest,
} from './types/game'

export async function createGameForUser(request: ICreateGameForUserRequest): Promise<IGameInstanceResponse> {
  const { data } = await api.post<IGameInstanceResponse>('/api/games', request)
  return data
}

export async function joinGameAsPlayer(
  gameCode: string,
  request: IJoinGameAsPlayerRequest,
): Promise<IGameInstanceResponse> {
  const { data } = await api.post<IGameInstanceResponse>(`/api/games/${encodeURIComponent(gameCode)}/join`, request)
  return data
}

export async function fetchGameCards(gameCode: string): Promise<ICardCatalogItemResponse[]> {
  const { data } = await api.get<ICardCatalogItemResponse[]>(`/api/games/${encodeURIComponent(gameCode)}/cards`)
  return data
}

export async function fetchGameState(gameCode: string): Promise<IGameStateResponse> {
  const { data } = await api.get<IGameStateResponse>(`/api/games/${encodeURIComponent(gameCode)}/state`)
  return data
}