import type { ICardCatalogItemResponse } from '@/types/cardCatalog'
import type { IGamePlayerStateResponse } from '@/services/api/gameApi'
import type { IGameActionOptionResponse } from '@/services/api/types/game'

export type IGameCard = ICardCatalogItemResponse

export type ILeaderCardViewModel = {
  instanceId: string
  cardDefinitionId: string
  ownerPlayerId: string
  controllerPlayerId: string
  isRested: boolean
  isExhausted: boolean
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
  currentPower: number
  currentDamage: number
  recoveryEffect: string
  availableActions?: IGameActionOptionResponse[]
}

export type INonLeaderCardViewModel = {
  instanceId: string
  cardDefinitionId: string
  ownerPlayerId: string
  controllerPlayerId: string
  id: string
  image: string
  displayName: string
  type: string
  isFaceUp: boolean
  isConcealedFromOpponent?: boolean
  // True while a reveal shows this card's face to both players (a "Reveal First" effect can turn an opponent's
  // face-down support card over, or show one of their hand cards).
  isRevealed: boolean
  isExhausted: boolean
  availableActions?: IGameActionOptionResponse[]
  isRested: boolean
  supportSlotIndex?: number | null
  currentPower: number
  currentHealth: number
  currentDamage: number
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
