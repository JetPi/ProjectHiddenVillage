import { create } from 'zustand'
import type { IDeckAdminViewStoreState } from '@/state/types/deckAdminViewStore'

const initialState = {
  searchText: '',
  type: [] as string[],
  color: [] as string[],
  sort: 'cardId',
}

export const useDeckAdminViewStore = create<IDeckAdminViewStoreState>()((set) => ({
  ...initialState,
  setSearchText: (value) => set({ searchText: value }),
  setTypeFilter: (value) =>
    set({
      type: Array.from(new Set(value.filter((entry) => entry && entry !== 'all'))),
    }),
  setColorFilter: (value) =>
    set({
      color: Array.from(new Set(value.filter((entry) => entry && entry !== 'all'))),
    }),
  setSort: (value) => set({ sort: value || 'cardId' }),
  resetFilters: () => set({ ...initialState }),
}))
