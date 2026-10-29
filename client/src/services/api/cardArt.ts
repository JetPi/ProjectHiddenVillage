import type { ICardCatalogItemResponse } from '@/types/cardCatalog'

const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3001'

/**
 * Every width card art may be requested at.
 *
 * `master` is the widest variant the API can serve, because an uploaded master is stored at
 * `CardArtOptions.ResolveMasterWidth()` (the largest allowed width) and the read path never upscales past it.
 * Raising `master` therefore raises the upload requirement too - `CARD_ART_MIN_SOURCE_WIDTH` mirrors it.
 */
export const CARD_ART_WIDTHS = {
  thumb: 120,
  board: 240,
  boardHi: 360,
  preview: 600,
  master: 900,
} as const

/**
 * Ascending list used for `srcset`. The server allowlist (`CardArt:AllowedWidths`) has to contain every entry
 * or the request is a 400, which is what `CardArtOptionsTests` guards.
 */
export const CARD_ART_WIDTH_LADDER: readonly number[] = [
  CARD_ART_WIDTHS.thumb,
  CARD_ART_WIDTHS.board,
  CARD_ART_WIDTHS.boardHi,
  CARD_ART_WIDTHS.preview,
  CARD_ART_WIDTHS.master,
]

/**
 * Native aspect ratio of card art. Used for intrinsic `width`/`height` so a card reserves its box before the
 * bytes arrive instead of reflowing - and briefly squashing - on load.
 */
export const CARD_ART_ASPECT = { width: 600, height: 831 } as const

/**
 * Narrowest upload the admin flow accepts.
 *
 * Deliberately *not* the master cap any more. The cap rose to 900 so dense screens get a dense file, but an
 * author uploading a 600-900 px image is still better off than being refused: the read path never upscales, so the
 * file is stored at its own width and simply answers the larger ladder steps with what it has. Raising the gate to
 * match the cap would reject art that already works.
 */
export const CARD_ART_MIN_SOURCE_WIDTH = CARD_ART_WIDTHS.preview

export const CARD_ART_MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export function cardArtUrl(cardId: string, width: number, imageVersion?: number | null): string {
  const query = new URLSearchParams({ w: String(width) })
  if (typeof imageVersion === 'number') {
    query.set('v', String(imageVersion))
  }

  return `${baseURL}/api/card-art/${encodeURIComponent(cardId)}?${query.toString()}`
}

/**
 * Builds the `srcset` for one card. A surface declares how wide it is drawn (`CARD_SIZES`), and the browser
 * picks the ladder step that covers that width at the device's pixel ratio - so a leader card on a 3x screen
 * fetches the 900 master while a support slot on a 1x screen fetches the 120 thumb.
 */
export function buildCardArtSrcSet(
  card: Pick<ICardCatalogItemResponse, 'id' | 'imageVersion'> | null | undefined,
  widths: readonly number[] = CARD_ART_WIDTH_LADDER,
): string | undefined {
  if (!card?.id || widths.length === 0) {
    return undefined
  }

  return widths
    .map((width) => `${cardArtUrl(card.id, width, card.imageVersion)} ${width}w`)
    .join(', ')
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
