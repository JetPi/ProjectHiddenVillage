import {
  fetchCardCatalogByIdsSparseCached,
} from './api/cardCatalogApi'
import { preloadImageSources } from './imagePreloadCache'

const FIXED_CARD_IDS = ['C-001', 'S-001']

let fixedCardsPreloadPromise: Promise<void> | null = null

function extractUniqueImageSources(imageSources: string[]): string[] {
  const uniqueSources: string[] = []
  const seen = new Set<string>()

  for (const source of imageSources) {
    const normalizedSource = source.trim()
    if (!normalizedSource || seen.has(normalizedSource)) {
      continue
    }

    seen.add(normalizedSource)
    uniqueSources.push(normalizedSource)
  }

  return uniqueSources
}

export async function preloadCardsByIds(cardIds: string[]): Promise<void> {
  const cards = await fetchCardCatalogByIdsSparseCached(cardIds)
  if (cards.length === 0) {
    return
  }

  const cardImageSources = extractUniqueImageSources(cards.map((card) => card.image))
  if (cardImageSources.length === 0) {
    return
  }

  await preloadImageSources(cardImageSources)
}

export function preloadFixedCards(): Promise<void> {
  if (fixedCardsPreloadPromise) {
    return fixedCardsPreloadPromise
  }

  fixedCardsPreloadPromise = preloadCardsByIds(FIXED_CARD_IDS).catch(() => {
    // Fixed-card preload is best effort and should not disrupt navigation.
    fixedCardsPreloadPromise = null
  })

  return fixedCardsPreloadPromise
}
