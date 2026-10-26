const CACHED_IMPORTED_DECK_KEY = 'phv-imported-deck'

export function readCachedImportedDeck(): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  const value = window.localStorage.getItem(CACHED_IMPORTED_DECK_KEY)
  return value && value.trim().length > 0 ? value : null
}

export function writeCachedImportedDeck(cardsPayload: string): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(CACHED_IMPORTED_DECK_KEY, cardsPayload)
}
