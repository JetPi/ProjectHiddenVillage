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
}
