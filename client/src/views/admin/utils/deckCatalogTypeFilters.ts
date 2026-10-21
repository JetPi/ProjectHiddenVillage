export const DECKABLE_CARD_TYPE_FILTERS = ['leader', 'character', 'ex character'] as const

export const NON_DECKABLE_CARD_TYPE_FILTERS = ['chakra', 'summon'] as const

const NON_DECKABLE_TYPE_FILTER_SET = new Set<string>(NON_DECKABLE_CARD_TYPE_FILTERS)

export function isNonDeckableCardTypeFilter(type: string): boolean {
  return NON_DECKABLE_TYPE_FILTER_SET.has(type.trim().toLowerCase())
}

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
