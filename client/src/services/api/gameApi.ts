import { api } from './httpClient'
import type { ICardCatalogItemResponse } from '../../types/cardCatalog'

type ICreateGameForUserRequest = {
  userId: string
  deckId: string
}

type IJoinGameAsPlayerRequest = {
  userId: string
  deckId?: string
}

export type IGameCardInstanceResponse = {
  instanceId: string
  cardDefinitionId: string
  ownerPlayerId: string
  controllerPlayerId: string
  isExhausted: boolean
}

export type IGamePlayerStateResponse = {
  playerId: string
  deck: IGameCardInstanceResponse[]
  deckCount: number
  hand: IGameCardInstanceResponse[]
  handCount: number
  characterField: IGameCardInstanceResponse[]
  supportZone: IGameCardInstanceResponse[]
  trash: IGameCardInstanceResponse[]
  exileZone: IGameCardInstanceResponse[]
}

export type IGameStateResponse = {
  gameId: string
  turnNumber: number
  activePlayerId: string
  priorityPlayerId: string
  phase: string
  players: IGamePlayerStateResponse[]
}

type IGameInstanceResponse = {
  id: string
}

export type IGameInstanceDetailResponse = {
  gameId: string
  turnNumber: number
  activePlayerId: string
  priorityPlayerId: string
  phase: string
  players: IGamePlayerStateResponse[]
}

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