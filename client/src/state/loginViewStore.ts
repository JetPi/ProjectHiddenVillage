import { create } from 'zustand'
import type { DeckOptionsEntryMode, GameCodeEntryMode } from '../types/login'
import type { LoginViewStoreState } from './types/loginViewStore'

const initialGameCodeByMode: Record<GameCodeEntryMode, string> = {
  quickmatch: 'casual',
  join: '',
  create: '',
}

const initialDeckOptionsByMode: Record<DeckOptionsEntryMode, string> = {
  import: '',
  saved_decks: '',
  starter_decks: '',
}

const initialState = {
  displayName: '',
  gameCodeMode: 'quickmatch' as GameCodeEntryMode,
  gameCodeByMode: initialGameCodeByMode,
  deckOptionsMode: 'import' as DeckOptionsEntryMode,
  deckOptionsByMode: initialDeckOptionsByMode,
  showDisplayNameError: false,
}

export const useLoginViewStore = create<LoginViewStoreState>()((set, get) => ({
  ...initialState,
  setDisplayName: (value) => {
    const hasValue = value.trim().length > 0

    set((state) => ({
      displayName: value,
      showDisplayNameError: state.showDisplayNameError ? !hasValue : state.showDisplayNameError,
    }))
  },
  setGameCodeMode: (mode) => set({ gameCodeMode: mode }),
  setGameCodeValue: (value) =>
    set((state) => ({
      gameCodeByMode: {
        ...state.gameCodeByMode,
        [state.gameCodeMode]: value,
      },
    })),
  setDeckOptionsMode: (mode) => set({ deckOptionsMode: mode }),
  setDeckOptionValue: (value) =>
    set((state) => ({
      deckOptionsByMode: {
        ...state.deckOptionsByMode,
        [state.deckOptionsMode]: value,
      },
    })),
  validateDisplayName: () => {
    const isValid = get().displayName.trim().length > 0
    set({ showDisplayNameError: !isValid })
    return isValid
  },
  reset: () =>
    set({
      ...initialState,
      gameCodeByMode: { ...initialGameCodeByMode },
      deckOptionsByMode: { ...initialDeckOptionsByMode },
    }),
}))
