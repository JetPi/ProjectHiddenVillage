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

type IPlayerPhaseActionRequest = {
  playerId: string
}

export type IGameCardInstanceResponse = {
  instanceId: string
  cardDefinitionId: string
  ownerPlayerId: string
  controllerPlayerId: string
  isExhausted: boolean
}

export type IGameLeaderCardInstanceResponse = {
  instanceId: string
  cardDefinitionId: string
  ownerPlayerId: string
  controllerPlayerId: string
  name: string
  color: string
  description: string
  traits: string[]
  damage: number
  power: number
  recoveryEffect: string
  totalLife: number
  currentLife: number
}

export type IGamePlayerStateResponse = {
  playerId: string
  resourcePool: number
  leaderCardInstance: IGameLeaderCardInstanceResponse | null
  deck: IGameCardInstanceResponse[]
  hand: IGameCardInstanceResponse[]
  battlefield: IGameCardInstanceResponse[]
  discardPile: IGameCardInstanceResponse[]
}

export type IGameStateResponse = {
  gameId: string
  turnNumber: number
  activePlayerId: string
  priorityPlayerId: string
  consecutivePasses: number
  players: IGamePlayerStateResponse[]
}

type IGameInstanceResponse = {
  id: string
}

export type IGameInstanceDetailResponse = {
  id: string
  state: IGameStateResponse
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

export async function fetchGameById(gameCode: string): Promise<IGameInstanceDetailResponse> {
  const { data } = await api.get<IGameInstanceDetailResponse>(`/api/games/${encodeURIComponent(gameCode)}`)
  return data
}

export async function declarePassInActionStep(
  gameCode: string,
  request: IPlayerPhaseActionRequest,
): Promise<IGameInstanceDetailResponse> {
  const { data } = await api.post<IGameInstanceDetailResponse>(
    `/api/games/${encodeURIComponent(gameCode)}/action-step/pass`,
    request,
  )

  return data
}

export async function declareActionInActionStep(
  gameCode: string,
  request: IPlayerPhaseActionRequest,
): Promise<IGameInstanceDetailResponse> {
  const { data } = await api.post<IGameInstanceDetailResponse>(
    `/api/games/${encodeURIComponent(gameCode)}/action-step/action`,
    request,
  )

  return data
}

export async function advancePhase(gameCode: string): Promise<IGameInstanceDetailResponse> {
  const { data } = await api.post<IGameInstanceDetailResponse>(`/api/games/${encodeURIComponent(gameCode)}/phase/advance`)
  return data
}