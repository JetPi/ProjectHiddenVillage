import type { IGameStateResponse } from '@/services/api/types/game'

export type IGameHubStoreState = {
  activeGameId: string | null
  gameState: IGameStateResponse | null
  isConnected: boolean
  isActionPending: boolean
  connectionError: string | null
  actionError: string | null
  initializeGameSession: (gameId: string, initialGameState: IGameStateResponse) => void
  setGameState: (gameState: IGameStateResponse) => void
  setConnected: (value: boolean) => void
  setActionPending: (value: boolean) => void
  setConnectionError: (value: string | null) => void
  setActionError: (value: string | null) => void
  resetConnectionState: () => void
}
