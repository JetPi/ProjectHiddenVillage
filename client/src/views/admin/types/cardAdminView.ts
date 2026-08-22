export type ICardAdminSortOption = {
  value: string
  label: string
}

export type ICardAdminFilterOption = {
  value: string
  label: string
}

export type ICardAdminServerParams = {
  page: number
  pageSize: number
  sort: string
}

export type ICardAdminLocalFilters = {
  searchText: string
  type: string[]
  color: string[]
}

export type ICardAdminSelectionState = {
  selectedCardId: string | null
}

export type ICardAdminViewState = ICardAdminServerParams & ICardAdminLocalFilters & ICardAdminSelectionState

export type ICardAdminViewActions = {
  setPage: (value: number) => void
  setPageSize: (value: number) => void
  setSort: (value: string) => void
  setSearchText: (value: string) => void
  setTypeFilter: (value: string[]) => void
  setColorFilter: (value: string[]) => void
  selectCard: (cardId: string) => void
  clearSelection: () => void
}

export type ICardAdminViewModel = ICardAdminViewState & ICardAdminViewActions
