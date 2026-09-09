import type { IGameActionOptionResponse } from '@/services/api/types/game'
import type { ICardCatalogItemResponse } from '@/types/cardCatalog'
import type { INonLeaderCardViewModel } from '@/views/game/types'

export type ICardOverlayVisibilityMode = 'hover' | 'mixed'

export type ICardOverlayZone = 'hand' | 'support' | 'battlefield' | 'character-field'

export type INonLeaderCardOverlayProps = {
  previewCard: ICardCatalogItemResponse | null
  card?: INonLeaderCardViewModel
  zone: ICardOverlayZone
  visibilityMode: ICardOverlayVisibilityMode
  actionOptions: IGameActionOptionResponse[]
  hidePreviewButton?: boolean
  showEmptyActionMessage?: boolean
  suppressActionFallback?: boolean
  disableInteractions?: boolean
  isTargetCandidate?: boolean
  onChooseTarget?: () => void
  isConnected: boolean
  isActionPending: boolean
  onSelectActionOption: (actionId: string) => void
}
