export type IDeckAdminFilterState = {
  searchText: string
  type: string[]
  color: string[]
  sort: string
  includeNonDeckableTypes: boolean
}

export type IDeckAdminViewStoreState = IDeckAdminFilterState & {
  setSearchText: (value: string) => void
  setTypeFilter: (value: string[]) => void
  setColorFilter: (value: string[]) => void
  setSort: (value: string) => void
  setIncludeNonDeckableTypes: (value: boolean) => void
  resetFilters: () => void
}
