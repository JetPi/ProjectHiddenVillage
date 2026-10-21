import type { ICardCatalogItemResponse } from '@/types/cardCatalog'

export type IDeckCardResponse = {
  cardId: string
  quantity: number
  card?: ICardCatalogItemResponse | null
}

export type IDeckType = 'Public' | 'User'

export type IDeckResponse = {
  id: string
  name: string
  type: string
  userId: string | null
  leaderColor?: string | null
  cards: IDeckCardResponse[]
}

export type IDeckCardInput = {
  cardId: string
  quantity: number
}
