import type { ICardCatalogItemResponse } from '@/types/cardCatalog'

export type IDeckCardResponse = {
  cardId: string
  quantity: number
  /** Present only on a populated read (`?populate=true`), which is what the deck editor asks for. */
  card?: ICardCatalogItemResponse | null
}

/** The deck types the API stores, as the readable names its responses and filters use. */
export type IDeckType = 'Public' | 'User'

export type IDeckResponse = {
  id: string
  /** Empty for the legacy text imports, which predate names; callers fall back to the id for those rows. */
  name: string
  type: string
  userId: string | null
  /** The leader's readable colour, or null when the deck has no leader; lets a lean list colour each deck. */
  leaderColor?: string | null
  cards: IDeckCardResponse[]
}

/** One structured card line of a deck write, as the admin builder sends it. */
export type IDeckCardInput = {
  cardId: string
  quantity: number
}
