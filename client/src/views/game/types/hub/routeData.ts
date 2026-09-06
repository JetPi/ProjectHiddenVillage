import type { IGameStateResponse } from '@/services/api/gameApi'
import type { ICardCatalogItemResponse } from '@/types/cardCatalog'

export type IGameLoaderData = {
  joinCode: string
  gameCards: ICardCatalogItemResponse[]
  gameState: IGameStateResponse
}

export type IGameActionData = {
  gameAction?: {
    ok: boolean
    intent: string
    error?: string
  }
}