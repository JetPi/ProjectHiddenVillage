import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type ISessionStoreState = {
  displayName: string
  gameCode: string
  setSession: (payload: { displayName: string; gameCode: string }) => void
  clearSession: () => void
}

const initialState = {
  displayName: '',
  gameCode: '',
}

export const useSessionStore = create<ISessionStoreState>()(
  persist(
    (set) => ({
      ...initialState,
      setSession: ({ displayName, gameCode }) => {
        set({
          displayName: displayName.trim(),
          gameCode: gameCode.trim(),
        })
      },
      clearSession: () => set(initialState),
    }),
    {
      name: 'phv-session',
    },
  ),
)
