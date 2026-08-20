import { api } from '@/services/api/httpClient'
import axios from 'axios'
import type { ICardCatalogItemResponse } from '@/types/cardCatalog'
import type {
  ICreateGameForUserRequest,
  IGameInstanceResponse,
  IGameStateResponse,
  IJoinGameAsPlayerRequest,
} from '@/services/api/types/game'
import { createGameForUserViaHub, joinGameAsPlayerViaHub } from '@/services/api/gameHubApi'

export type {
  ICreateGameForUserRequest,
  IGameCardInstanceResponse,
  IGameInstanceDetailResponse,
  IGameInstanceResponse,
  IGamePlayerStateResponse,
  IGameStateResponse,
  IJoinGameAsPlayerRequest,
} from '@/services/api/types/game'

function toGameInstanceResponse(payload: unknown): IGameInstanceResponse {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Game response payload is missing.')
  }

  const candidate = payload as { id?: unknown; gameId?: unknown }
  if (typeof candidate.id === 'string' && candidate.id.trim().length > 0) {
    return { id: candidate.id }
  }

  if (typeof candidate.gameId === 'string' && candidate.gameId.trim().length > 0) {
    return { id: candidate.gameId }
  }

  throw new Error('Game response id is missing.')
}

export async function createGameForUser(request: ICreateGameForUserRequest): Promise<IGameInstanceResponse> {
  try {
    const { data } = await api.post<unknown>('/api/games', request)
    return toGameInstanceResponse(data)
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
    const { data } = await api.post<unknown>(`/api/games/${encodeURIComponent(gameCode)}/join`, request)
    return toGameInstanceResponse(data)
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