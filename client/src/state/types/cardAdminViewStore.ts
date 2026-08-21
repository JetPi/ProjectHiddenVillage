import type { ICardAdminViewState } from '@/views/admin/types/cardAdminView'

export type ICardAdminViewStoreState = ICardAdminViewState & {
  setPage: (value: number) => void
  setPageSize: (value: number) => void
  setSort: (value: string) => void
  setSearchText: (value: string) => void
  setTypeFilter: (value: string) => void
  setColorFilter: (value: string) => void
  selectCard: (cardId: string) => void
  clearSelection: () => void
}
