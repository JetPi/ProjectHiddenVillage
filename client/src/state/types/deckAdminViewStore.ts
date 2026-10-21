/**
 * The catalogue filters the deck screen keeps while the admin moves between decks. Deliberately just the
 * filters: the deck being edited belongs to the route (`/admin/decks/:deckId`), so it cannot go stale in a store.
 */
export type IDeckAdminFilterState = {
  searchText: string
  type: string[]
  color: string[]
  sort: string
  /** Chakra and Summon are deck-illegal, so the builder hides them until this is turned on. Off by default. */
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
