import { api } from './httpClient'
import axios from 'axios'
import type { ICardCatalogItemResponse } from '../../types/cardCatalog'
import type {
  ICreateGameForUserRequest,
  IGameInstanceResponse,
  IGameStateResponse,
  IJoinGameAsPlayerRequest,
} from './types/game'
import { createGameForUserViaHub, joinGameAsPlayerViaHub } from './gameHubApi'

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
  try {
    const { data } = await api.post<IGameInstanceResponse>('/api/games', request)
    return data
  } catch (error) {
    if (!axios.isAxiosError(error)) {
      throw error
    }

    const status = error.response?.status
    if (status === 404 || status === 405) {
      return createGameForUserViaHub(request)
    }

    throw error
  }
}

export async function joinGameAsPlayer(
  gameCode: string,
  request: IJoinGameAsPlayerRequest,
): Promise<IGameInstanceResponse> {
  try {
    const { data } = await api.post<IGameInstanceResponse>(`/api/games/${encodeURIComponent(gameCode)}/join`, request)
    return data
  } catch (error) {
    if (!axios.isAxiosError(error)) {
      throw error
    }

    const status = error.response?.status
    if (status === 404 || status === 405) {
      return joinGameAsPlayerViaHub(gameCode, request)
    }

    throw error
  }
}

export async function fetchGameCards(gameCode: string): Promise<ICardCatalogItemResponse[]> {
  const { data } = await api.get<ICardCatalogItemResponse[]>(`/api/games/${encodeURIComponent(gameCode)}/cards`)
  return data
}

export async function fetchGameState(gameCode: string): Promise<IGameStateResponse> {
  const { data } = await api.get<IGameStateResponse>(`/api/games/${encodeURIComponent(gameCode)}/state`)
  return data
}