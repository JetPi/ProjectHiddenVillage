import type { ICardCatalogItemResponse } from '@/types/cardCatalog'

const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3001'

export const CARD_ART_WIDTHS = {
  board: 240,
  preview: 600,
} as const

export const CARD_ART_MIN_SOURCE_WIDTH = CARD_ART_WIDTHS.preview

export const CARD_ART_MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export function cardArtUrl(cardId: string, width: number, imageVersion?: number | null): string {
  const query = new URLSearchParams({ w: String(width) })
  if (typeof imageVersion === 'number') {
    query.set('v', String(imageVersion))
  }

  return `${baseURL}/api/card-art/${encodeURIComponent(cardId)}?${query.toString()}`
}

export function resolveCardArtUrl(
  card: Pick<ICardCatalogItemResponse, 'id' | 'image' | 'imageVersion'> | null | undefined,
  width: number,
): string {
  if (!card || !card.id) {
    return card?.image ?? ''
  }

  return cardArtUrl(card.id, width, card.imageVersion)
}

const LOCAL_ART_PREFIX = 'local:'

export function isLocalCardArtReference(image: string): boolean {
  return image.trim().toLowerCase().startsWith(LOCAL_ART_PREFIX)
}

export function isExternalCardArtReference(image: string): boolean {
  try {
    const { protocol } = new URL(image.trim())

    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

export function resolveCardArtSourceHref(
  card: Pick<ICardCatalogItemResponse, 'id' | 'image' | 'imageVersion'> | null | undefined,
  width: number,
): string | null {
  const image = card?.image?.trim() ?? ''

  if (image.length === 0) {
    return null
  }

  if (isExternalCardArtReference(image)) {
    return image
  }

  if (isLocalCardArtReference(image)) {
    return card?.id ? cardArtUrl(card.id, width, card.imageVersion) : null
  }

  return null
}
