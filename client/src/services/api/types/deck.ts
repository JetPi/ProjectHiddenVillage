export type ICreateDeckRequest = {
  type: number
  cards: string
  userId: string
}

export type IFetchDecksQuery = {
  userId?: string
  populate?: boolean
}
