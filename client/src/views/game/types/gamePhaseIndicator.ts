import type { IGameStateResponse } from '../../../services/api/gameApi'

export type IGamePhaseIndicatorProps = {
  gameInstance: IGameStateResponse
  authUserId?: string
}
