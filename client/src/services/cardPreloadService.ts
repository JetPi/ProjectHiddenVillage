import {
  fetchCardCatalogByIdsSparseCached,
} from '@/services/api/cardCatalogApi'
import { cardArtUrl } from '@/services/api/cardArt'
import { preloadImageSources } from '@/services/imagePreloadCache'
import type { ICardCatalogItemResponse } from '@/types/cardCatalog'

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

export type ICardArtPreloadEntry = Pick<ICardCatalogItemResponse, 'id' | 'imageVersion'>

function extractUniqueCardArtSources(
  cards: readonly ICardArtPreloadEntry[],
  width: number,
): string[] {
  const sources = cards.map((card) => (card.id ? cardArtUrl(card.id, width, card.imageVersion) : ''))
  return extractUniqueImageSources(sources)
}

/** Preloads one width bucket for a set of catalog cards (no-op for already-cached URLs). */
export async function preloadCardArt(
  cards: readonly ICardArtPreloadEntry[],
  width: number,
): Promise<void> {
  const sources = extractUniqueCardArtSources(cards, width)
  if (sources.length === 0) {
    return
  }

  await preloadImageSources(sources)
}

/**
 * Preloads card art in priority order. Each batch fully resolves before the next
 * one starts, so visible board art hits the network first, then previews, then
 * the remaining deck/trash art.
 */
export async function preloadCardArtInPriorityBatches(
  batches: ReadonlyArray<{ cards: readonly ICardArtPreloadEntry[]; width: number }>,
): Promise<void> {
  for (const batch of batches) {
    if (batch.cards.length > 0) {
      await preloadCardArt(batch.cards, batch.width)
    }
  }
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

