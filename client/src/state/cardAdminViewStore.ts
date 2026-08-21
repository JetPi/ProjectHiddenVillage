import { create } from 'zustand'
import type { ICardAdminViewStoreState } from '@/state/types/cardAdminViewStore'

const initialState = {
  page: 1,
  pageSize: 25,
  sort: 'cardId',
  searchText: '',
  type: 'all',
  color: 'all',
  selectedCardId: null,
}

export const useCardAdminViewStore = create<ICardAdminViewStoreState>()((set) => ({
  ...initialState,
  setPage: (value) => set({ page: Math.max(1, Math.floor(value)) }),
  setPageSize: (value) =>
    set({
      pageSize: Math.min(100, Math.max(1, Math.floor(value))),
      page: 1,
    }),
  setSort: (value) => set({ sort: value || 'cardId', page: 1 }),
  setSearchText: (value) => set({ searchText: value, page: 1 }),
  setTypeFilter: (value) => set({ type: value || 'all', page: 1 }),
  setColorFilter: (value) => set({ color: value || 'all', page: 1 }),
  selectCard: (cardId) => set({ selectedCardId: cardId }),
  clearSelection: () => set({ selectedCardId: null }),
}))
