export type ICreateGameForUserRequest = {
  userId: string
  deckId: string
}

export type IJoinGameAsPlayerRequest = {
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

export type IGameInstanceResponse = {
  id: string
}

export type IGameInstanceDetailResponse = IGameStateResponse
