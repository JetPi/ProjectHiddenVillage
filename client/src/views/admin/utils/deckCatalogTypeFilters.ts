/**
 * The catalogue's type filter, seen from the deck builder.
 *
 * A deck can only contain Leaders and Characters, so the builder's catalogue hides Chakra and Summon unless the
 * author explicitly asks for them. Hiding them is expressed as an include-list on the query, because the
 * catalogue endpoint filters by what it returns, not by what it skips - with no type selected the request asks
 * for every deckable type rather than "all types".
 */
export const DECKABLE_CARD_TYPE_FILTERS = ['leader', 'character', 'ex character'] as const

export const NON_DECKABLE_CARD_TYPE_FILTERS = ['chakra', 'summon'] as const

const NON_DECKABLE_TYPE_FILTER_SET = new Set<string>(NON_DECKABLE_CARD_TYPE_FILTERS)

/** Values here are the lowercase readable forms the catalogue listing accepts (see `TYPE_FILTER_OPTIONS`). */
export function isNonDeckableCardTypeFilter(type: string): boolean {
  return NON_DECKABLE_TYPE_FILTER_SET.has(type.trim().toLowerCase())
}

/**
 * The `types` list to send. With the toggle on, the author's own selection is sent untouched (an empty selection
 * means every type). With it off, Chakra and Summon are dropped from the selection, and an empty selection
 * becomes the deckable types so the server never falls back to returning everything.
 */
export function resolveDeckCatalogTypeFilter(
  selectedTypes: readonly string[],
  includeNonDeckableTypes: boolean,
): string[] {
  if (includeNonDeckableTypes) {
    return [...selectedTypes]
  }

  const deckableTypes = selectedTypes.filter((type) => !isNonDeckableCardTypeFilter(type))

  return deckableTypes.length > 0 ? deckableTypes : [...DECKABLE_CARD_TYPE_FILTERS]
}
