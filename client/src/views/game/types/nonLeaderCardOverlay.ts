import type { IGameActionOptionResponse } from '../../../services/api/types/game'

export type ICardOverlayVisibilityMode = 'hover' | 'mixed'

export type ICardOverlayZone = 'hand' | 'support' | 'battlefield'

export type INonLeaderCardOverlayProps = {
  cardName: string
  zone: ICardOverlayZone
  visibilityMode: ICardOverlayVisibilityMode
  actionOptions: IGameActionOptionResponse[]
  isConnected: boolean
  isActionPending: boolean
  onSelectActionOption: (actionId: string) => void
}
