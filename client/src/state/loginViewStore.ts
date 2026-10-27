import { create } from 'zustand'
import type { IDeckOptionsEntryMode, IRulesetMode } from '@/types/login'
import type { ILoginViewStoreState } from '@/state/types/loginViewStore'
import { readCachedImportedDeck } from '@/views/login/utils/cachedImportedDeck'

// Quick match queues inside one format and hosting opens a table bound to one, so each keeps a ruleset id that the
// view fills in as soon as the active rulesets arrive. Joining keeps the code the player typed instead, and the two
// live side by side on the Join or Host tab, which is why they are separate fields rather than per-tab strings.
const initialRulesetIdByMode: Record<IRulesetMode, string> = {
  quickmatch: '',
  host: '',
}

const initialDeckOptionsByMode: Record<IDeckOptionsEntryMode, string> = {
  import: readCachedImportedDeck() ?? '',
  saved_decks: '',
  starter_decks: '',
}

const initialState = {
  displayName: '',
  gameEntryMode: 'quickmatch' as const,
  joinGameCode: '',
  rulesetIdByMode: initialRulesetIdByMode,
  // Off by default: a hosted table is timed unless the host says otherwise, and quick match has no such toggle at all.
  hostTimeRelaxed: false,
  deckOptionsMode: 'import' as IDeckOptionsEntryMode,
  deckOptionsByMode: initialDeckOptionsByMode,
  showDisplayNameError: false,
}

export const useLoginViewStore = create<ILoginViewStoreState>()((set, get) => ({
  ...initialState,
  setDisplayName: (value) => {
    const hasValue = value.trim().length > 0

    set((state) => ({
      displayName: value,
      showDisplayNameError: state.showDisplayNameError ? !hasValue : state.showDisplayNameError,
    }))
  },
  setGameEntryMode: (mode) => set({ gameEntryMode: mode }),
  setJoinGameCode: (value) => set({ joinGameCode: value }),
  setRulesetId: (mode, value) =>
    set((state) => ({
      rulesetIdByMode: {
        ...state.rulesetIdByMode,
        [mode]: value,
      },
    })),
  setHostTimeRelaxed: (value) => set({ hostTimeRelaxed: value }),
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
      rulesetIdByMode: { ...initialRulesetIdByMode },
      deckOptionsByMode: { ...initialDeckOptionsByMode },
    }),
}))
