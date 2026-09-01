import type { IGameActionOptionResponse } from '@/services/api/types/game'
import type { ICardCatalogItemResponse } from '@/types/cardCatalog'

export type ICardOverlayVisibilityMode = 'hover' | 'mixed'

export type ICardOverlayZone = 'hand' | 'support' | 'battlefield' | 'character-field'

export type INonLeaderCardOverlayProps = {
  previewCard: ICardCatalogItemResponse | null
  zone: ICardOverlayZone
  visibilityMode: ICardOverlayVisibilityMode
  actionOptions: IGameActionOptionResponse[]
  hidePreviewButton?: boolean
  showEmptyActionMessage?: boolean
  suppressActionFallback?: boolean
  disableInteractions?: boolean
  isConnected: boolean
  isActionPending: boolean
  onSelectActionOption: (actionId: string) => void
}
