import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ISessionStoreState } from '@/state/types/sessionStore'

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
