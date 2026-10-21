import {
  fetchCardCatalogByIdsSparseCached,
} from '@/services/api/cardCatalogApi'
import { CARD_ART_WIDTHS, cardArtUrl } from '@/services/api/cardArt'
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

  const cardImageSources = extractUniqueCardArtSources(cards, CARD_ART_WIDTHS.board)
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
    fixedCardsPreloadPromise = null
  })

  return fixedCardsPreloadPromise
}

