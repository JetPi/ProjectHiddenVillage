export type DeckCardResponse = {
  cardId: string
  quantity: number
}

export type DeckResponse = {
  id: string
  type: string
  userId: string | null
  cards: DeckCardResponse[]
}