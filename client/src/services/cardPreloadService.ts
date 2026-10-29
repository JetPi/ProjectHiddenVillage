import {
  fetchCardCatalogByIdsSparseCached,
} from '@/services/api/cardCatalogApi'
import { CARD_ART_WIDTHS, CARD_ART_WIDTH_LADDER, cardArtUrl } from '@/services/api/cardArt'
import { preloadImageSources } from '@/services/imagePreloadCache'
import type { ICardCatalogItemResponse } from '@/types/cardCatalog'

const FIXED_CARD_IDS = ['C-001', 'S-001']

/**
 * Widest a board card is drawn, in CSS px. The leader card is the largest surface: the board caps at 1050 CSS px,
 * the leader column is `1.1fr` of `1.1fr 1.7fr 1.1fr`, and the card is height driven at the art ratio (0.722).
 * Every other card on the board is narrower, so this is the width the preloader has to cover.
 */
const WIDEST_BOARD_CARD_CSS_PX = 290

/** Past 3x there is nothing left to gain: the ladder's widest step is the master. */
const MAX_PRELOAD_PIXEL_RATIO = 3

/**
 * The ladder step worth warming up for this display.
 *
 * The preloader used to fetch the 600 px preview for every visible card on every device - more bytes than a 1x
 * screen will ever paint, and still the wrong file for a 3x screen. This picks the smallest step that covers the
 * largest board card at the current pixel ratio, so what is preloaded is what `srcset` will actually select.
 */
export function resolveVisibleCardArtPreloadWidth(): number {
  const devicePixelRatio = typeof window === 'undefined'
    ? 1
    : Math.min(Math.max(window.devicePixelRatio || 1, 1), MAX_PRELOAD_PIXEL_RATIO)
  const neededWidth = WIDEST_BOARD_CARD_CSS_PX * devicePixelRatio

  return CARD_ART_WIDTH_LADDER.find((width) => width >= neededWidth) ?? CARD_ART_WIDTHS.master
}

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

