import type { ICardCatalogItemResponse } from '@/types/cardCatalog'

export type IDeckCardResponse = {
  cardId: string
  quantity: number
  card?: ICardCatalogItemResponse | null
}

export type IDeckType = 'Public' | 'User'

/**
 * The requesting player's record with one deck. The server only ever returns the caller's own record, so a deck
 * shared between players (a public one) still shows each player their own wins and losses.
 */
export type IDeckRecord = {
  wins: number
  losses: number
  draws: number
}

export type IDeckResponse = {
  id: string
  name: string
  type: string
  userId: string | null
  leaderColor?: string | null
  cards: IDeckCardResponse[]
  record?: IDeckRecord | null
  /** The leader card the deck is built around; the one card that decides whether an overwrite keeps its record. */
  leaderCardId?: string | null
}

export type IDeckCardInput = {
  cardId: string
  quantity: number
}
