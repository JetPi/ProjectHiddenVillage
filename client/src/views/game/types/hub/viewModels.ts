import type { ICardCatalogItemResponse } from '@/types/cardCatalog'
import type { IGamePlayerStateResponse } from '@/services/api/gameApi'
import type { ICardStatusEffect, IGameActionOptionResponse } from '@/services/api/types/game'

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
  /**
   * `srcset` for the card art width ladder. `image` stays the single-URL fallback (and what the preloader warms
   * up), but a board card is drawn anywhere from ~50 to ~290 CSS px wide, so only the ladder lets the browser
   * fetch a file that is actually dense enough for the box and the device pixel ratio.
   */
  imageSrcSet: string
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
  statusEffects: ICardStatusEffect[]
}

export type INonLeaderCardViewModel = {
  instanceId: string
  cardDefinitionId: string
  ownerPlayerId: string
  controllerPlayerId: string
  id: string
  image: string
  /** Sibling of `image`: the full width ladder, see {@link ILeaderCardViewModel.imageSrcSet}. */
  imageSrcSet: string
  displayName: string
  type: string
  isFaceUp: boolean
  isConcealedFromOpponent?: boolean
  isRevealed: boolean
  isExhausted: boolean
  availableActions?: IGameActionOptionResponse[]
  statusEffects: ICardStatusEffect[]
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
