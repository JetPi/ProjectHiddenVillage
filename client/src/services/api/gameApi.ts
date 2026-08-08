import { api } from './httpClient'
import type { CardCatalogItemResponse } from '../../types/cardCatalog'

type CreateGameForUserRequest = {
  userId: string
  deckId: string
}

type JoinGameAsPlayerRequest = {
  userId: string
  deckId?: string
}

export type GameCardInstanceResponse = {
  instanceId: string
  cardDefinitionId: string
  ownerPlayerId: string
  controllerPlayerId: string
  isExhausted: boolean
}

export type GamePlayerStateResponse = {
  playerId: string
  resourcePool: number
  deck: GameCardInstanceResponse[]
  hand: GameCardInstanceResponse[]
  battlefield: GameCardInstanceResponse[]
  discardPile: GameCardInstanceResponse[]
}

export type GameStateResponse = {
  gameId: string
  turnNumber: number
  activePlayerId: string
  priorityPlayerId: string
  consecutivePasses: number
  players: GamePlayerStateResponse[]
}

type GameInstanceResponse = {
  id: string
}

export type GameInstanceDetailResponse = {
  id: string
  state: GameStateResponse
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

export async function fetchGameById(gameCode: string): Promise<GameInstanceDetailResponse> {
  const { data } = await api.get<GameInstanceDetailResponse>(`/api/games/${encodeURIComponent(gameCode)}`)
  return data
}