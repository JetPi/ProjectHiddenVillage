import { api } from '@/services/api/httpClient'
import axios from 'axios'
import { getAuthAccessToken } from '@/state/authSession'
import type { ICardCatalogItemResponse } from '@/types/cardCatalog'
import type {
  ICreateGameForUserRequest,
  IGameInstanceResponse,
  IGameRulesetBindingResponse,
  IGameStateResponse,
  IJoinGameAsPlayerRequest,
} from '@/services/api/types/game'
import { createGameForUserViaHub, joinGameAsPlayerViaHub } from '@/services/api/gameHubApi'

export type {
  ICreateGameForUserRequest,
  IEffectNoticeResponse,
  IGameCardInstanceResponse,
  IGameInstanceDetailResponse,
  IGameInstanceResponse,
  IGameOutcomeResponse,
  IGamePlayerStateResponse,
  IGameRulesetBindingResponse,
  IGameStateResponse,
  IJoinGameAsPlayerRequest,
  IPendingPromptResponse,
  ISupportChainEntryResponse,
  ISupportChainTargetResponse,
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

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3001'

/**
 * Tells the server this player is leaving the reserved rematch table without claiming a seat.
 *
 * Deliberately `fetch` with `keepalive` rather than the axios client: the likeliest caller is `pagehide`, where a
 * normal request is cancelled along with the page. It is best effort by design - a release that never arrives leaves
 * the reservation to lapse on its own, which is what the thirty-minute ceiling is for.
 */
export function releaseRematchReservation(gameCode: string): void {
  const code = gameCode.trim()

  if (!code) {
    return
  }

  const token = getAuthAccessToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  try {
    void fetch(`${apiBaseUrl}/api/games/${encodeURIComponent(code)}/rematch/release`, {
      method: 'POST',
      headers,
      keepalive: true,
      body: '{}',
    }).catch(() => undefined)
  } catch {
    // Nothing worth reporting: the reservation expires on its own.
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

/**
 * The format a game is played in, readable without being a player of it: a player holding a code needs it to judge
 * their deck before asking to join. A code that matches no live game answers null, because that is an ordinary state
 * while a code is being typed - and `null` also covers an unbound game, which has no format to check.
 */
/**
 * The same format probe, for a code the player is already holding from a rematch agreement. Unlike
 * <see cref="fetchGameRuleset"/> it does not turn a 404 into <c>null</c>: for a reserved code, "no table and no
 * reservation" means the rematch is gone, and the caller has to be able to tell that from an unbound table.
 */
export async function fetchRematchReservation(gameCode: string): Promise<IGameRulesetBindingResponse | null> {
  const { data } = await api.get<IGameRulesetBindingResponse | null>(
    `/api/games/${encodeURIComponent(gameCode)}/ruleset`,
  )

  return data ?? null
}

export async function fetchGameRuleset(gameCode: string): Promise<IGameRulesetBindingResponse | null> {
  try {
    const { data } = await api.get<IGameRulesetBindingResponse | null>(
      `/api/games/${encodeURIComponent(gameCode)}/ruleset`,
    )

    return data ?? null
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null
    }

    throw error
  }
}