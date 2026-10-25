const SAVED_DECK_NAME_PATTERN = /^Saved Deck (\d+)$/i

export function buildDefaultSavedDeckName(decks: readonly { name: string }[]): string {
  let highestNumber = 0

  for (const deck of decks) {
    const match = SAVED_DECK_NAME_PATTERN.exec(deck.name.trim())
    if (!match) {
      continue
    }

    const deckNumber = Number.parseInt(match[1], 10)
    if (Number.isFinite(deckNumber)) {
      highestNumber = Math.max(highestNumber, deckNumber)
    }
  }

  return `Saved Deck ${highestNumber + 1}`
}
