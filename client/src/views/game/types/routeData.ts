import type { IGameInstanceDetailResponse } from '../../../services/api/gameApi'
import type { ICardCatalogItemResponse } from '../../../types/cardCatalog'

export type IGameLoaderData = {
  joinCode: string
  gameCards: ICardCatalogItemResponse[]
  gameInstance: IGameInstanceDetailResponse
}

export type IGameActionData = {
  gameAction?: {
    ok: boolean
    intent: string
    error?: string
  }
}