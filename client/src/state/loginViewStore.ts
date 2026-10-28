import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { IDeckOptionsEntryMode, IRulesetMode } from '@/types/login'
import type { ILoginViewStoreState, IPersistedLoginViewState } from '@/state/types/loginViewStore'
import { readCachedImportedDeck } from '@/views/login/utils/cachedImportedDeck'

const PERSISTED_STORE_KEY = 'phv-login-selections'

// Quick match queues inside one format and hosting opens a table bound to one, so each keeps a ruleset id that the
// view fills in as soon as the active rulesets arrive. Joining keeps the code the player typed instead, and the two
// live side by side on the Join or Host tab, which is why they are separate fields rather than per-tab strings.
const initialRulesetIdByMode: Record<IRulesetMode, string> = {
  quickmatch: '',
  host: '',
}

// The imported deck has its own cache (`phv-imported-deck`), written while the player types and when an import
// resolves. It is read here and deliberately left out of the persisted slice, so exactly one place owns that text.
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

/**
 * A stored object is not the whole state: it is what `partialize` wrote, from an older version of this shape. Every
 * member it does not carry therefore falls back to its default instead of arriving as `undefined`, and the imported
 * deck is read from its own cache so the two stores cannot disagree about it.
 */
function mergePersistedState(
  persistedState: unknown,
  currentState: ILoginViewStoreState,
): ILoginViewStoreState {
  const persisted = (persistedState ?? {}) as Partial<IPersistedLoginViewState>

  return {
    ...currentState,
    ...persisted,
    rulesetIdByMode: { ...initialRulesetIdByMode, ...persisted.rulesetIdByMode },
    deckOptionsByMode: {
      ...initialDeckOptionsByMode,
      ...persisted.deckOptionsByMode,
      import: readCachedImportedDeck() ?? '',
    },
  }
}

export const useLoginViewStore = create<ILoginViewStoreState>()(
  persist(
    (set, get) => ({
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
      setDeckOptionValueForMode: (mode, value) =>
        set((state) => ({
          deckOptionsByMode: {
            ...state.deckOptionsByMode,
            [mode]: value,
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
    }),
    {
      name: PERSISTED_STORE_KEY,
      version: 1,
      // The join code belongs to one match and the validation flag belongs to one submit, so neither is stored: the
      // remembered configuration is what saves re-picking, not the leftovers of the last attempt.
      partialize: (state): IPersistedLoginViewState => ({
        displayName: state.displayName,
        gameEntryMode: state.gameEntryMode,
        rulesetIdByMode: state.rulesetIdByMode,
        hostTimeRelaxed: state.hostTimeRelaxed,
        deckOptionsMode: state.deckOptionsMode,
        deckOptionsByMode: {
          import: '',
          saved_decks: state.deckOptionsByMode.saved_decks,
          starter_decks: state.deckOptionsByMode.starter_decks,
        },
      }),
      merge: mergePersistedState,
    },
  ),
)
