import type { ICardCatalogItemResponse } from '../../../types/cardCatalog'
import type { IGamePlayerStateResponse } from '../../../services/api/gameApi'

export type IGameCard = ICardCatalogItemResponse

export type ILeaderCardViewModel = {
  instanceId: string
  cardDefinitionId: string
  ownerPlayerId: string
  controllerPlayerId: string
  id: string
  image: string
  attribute: string | null
  name: string[]
  displayName: string
  type: string
  traits: string[]
  color: string
  description: string
  damage: number
  power: number
  life: number | null
  currentLife: number | null
  recoveryEffect: string
}

export type IDerivedGameViewState = {
  cardById: Map<string, IGameCard>
  cardTypeById: Map<string, string>
  currentPlayer: IGamePlayerStateResponse | null
  opponentPlayer: IGamePlayerStateResponse | null
  topLeaderCard: ILeaderCardViewModel | null
  bottomLeaderCard: ILeaderCardViewModel | null
}

export type ICardPreloadPayload = {
  cardIds: string[]
  signature: string
}