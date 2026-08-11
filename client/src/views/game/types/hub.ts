import type { IGameStateResponse } from '../../../services/api/gameApi'

export type IGameHubActionIntent = 'pass-turn' | 'declare-action' | 'advance-phase'

export type IUseGameHubStateResult = {
  gameState: IGameStateResponse
  isConnected: boolean
  isActionPending: boolean
  connectionError: string | null
  actionError: string | null
  submitHubIntent: (intent: IGameHubActionIntent) => Promise<void>
}
