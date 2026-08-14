import type { IGameActionOptionResponse, IGameStateResponse } from '../../../services/api/types/game'

export type IGamePhaseActionRowProps = {
  gameInstance: IGameStateResponse
  authUserId?: string
  availableActions: IGameActionOptionResponse[]
  isConnected: boolean
  isActionPending: boolean
  onSelectAction: (action: IGameActionOptionResponse) => void
}