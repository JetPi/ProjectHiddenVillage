import type { ICardCatalogItemResponse } from '@/types/cardCatalog'

const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3001'

export const CARD_ART_WIDTHS = {
  hud: 120,
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
