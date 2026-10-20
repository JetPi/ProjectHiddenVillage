/**
 * The catalogue filters the deck screen keeps while the admin moves between decks. Deliberately just the
 * filters: the deck being edited belongs to the route (`/admin/decks/:deckId`), so it cannot go stale in a store.
 */
export type IDeckAdminFilterState = {
  searchText: string
  type: string[]
  color: string[]
  sort: string
}

export type IDeckAdminViewStoreState = IDeckAdminFilterState & {
  setSearchText: (value: string) => void
  setTypeFilter: (value: string[]) => void
  setColorFilter: (value: string[]) => void
  setSort: (value: string) => void
  resetFilters: () => void
}
