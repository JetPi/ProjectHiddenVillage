import { create } from 'zustand'
import type { IGameStateResponse } from '../services/api/gameApi'

type IGameHubStoreState = {
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

const initialState = {
  activeGameId: null,
  gameState: null,
  isConnected: false,
  isActionPending: false,
  connectionError: null,
  actionError: null,
}

export const useGameHubStore = create<IGameHubStoreState>()((set) => ({
  ...initialState,
  initializeGameSession: (gameId, initialGameState) =>
    set((state) => {
      if (state.activeGameId === gameId && state.gameState) {
        return state
      }

      return {
        ...initialState,
        activeGameId: gameId,
        gameState: initialGameState,
      }
    }),
  setGameState: (gameState) => set({ gameState }),
  setConnected: (value) => set({ isConnected: value }),
  setActionPending: (value) => set({ isActionPending: value }),
  setConnectionError: (value) => set({ connectionError: value }),
  setActionError: (value) => set({ actionError: value }),
  resetConnectionState: () =>
    set(() => ({
      isConnected: false,
      isActionPending: false,
      connectionError: null,
      actionError: null,
    })),
}))
