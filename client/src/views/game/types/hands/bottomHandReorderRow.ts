import type { RefCallback } from 'react'
import type { ICardCatalogItemResponse } from '@/types/cardCatalog'
import type { IGameActionOptionResponse, IGameCardInstanceResponse } from '@/services/api/types/game'

export type IBottomHandReorderRowProps = {
  cards: IGameCardInstanceResponse[]
  rowRef: RefCallback<HTMLDivElement>
  cardById: Map<string, ICardCatalogItemResponse>
  availableActions: IGameActionOptionResponse[]
  faceUpByInstanceId: Record<string, boolean>
  showNoActionsMessage: boolean
  isConnected: boolean
  isActionPending: boolean
  onSelectCardActionOption: (option: IGameActionOptionResponse) => void
  /** True while a single-target effect (not an attack) is waiting for the player to choose a hand card. */
  isEffectActionTargeting?: boolean
  /** Normalized instance ids of the own-hand cards the pending effect accepts as targets. */
  validEffectTargetsByCardId?: ReadonlySet<string>
  onChooseTarget?: (cardInstanceId: string) => void
}
