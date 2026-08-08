export type IDeckCardResponse = {
  cardId: string
  quantity: number
}

export type IDeckResponse = {
  id: string
  type: string
  userId: string | null
  cards: IDeckCardResponse[]
}