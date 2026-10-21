import type { IDeckCardInput, IDeckType } from '@/types/deck'

export type ICreateDeckRequest = {
  type: number
  cards: string
  userId: string
}

export type ICreatePublicDeckRequest = {
  name: string
  cards: IDeckCardInput[]
}

export type IUpdateDeckRequest = {
  name: string
  cards: IDeckCardInput[]
}

export type IFetchDecksQuery = {
  userId?: string
  populate?: boolean
  type?: IDeckType
}
