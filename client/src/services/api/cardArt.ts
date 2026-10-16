import type { ICardCatalogItemResponse } from '@/types/cardCatalog'

const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3001'

export const CARD_ART_WIDTHS = {
  board: 240,
  preview: 600,
} as const

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

/**
 * Mirrors the server's stored-art contract (`CardArtSourceReference`): a card's `image` is either an absolute
 * URL someone else hosts, or `local:<folder>/<cardId>.webp` for a master stored on our own disk.
 */
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

/**
 * Where an author can go to look at the art a card stores. An external reference points at the page it came from;
 * a `local:` one is a server-side path with no page of its own, so the served art stands in for it.
 */
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
