import type { RefObject } from 'react'
import type { IGameStateResponse } from '@/services/api/gameApi'
import type { IGameActionOptionResponse } from '@/services/api/types/game'
import type { IDerivedGameViewState } from '@/views/game/types/viewModels'

export type IGameZonesProps = {
  boardZoneRef: RefObject<HTMLDivElement | null>
  joinCode: string
  derivedGameState: IDerivedGameViewState
  topDeckCardRef: RefObject<HTMLDivElement | null>
  bottomDeckCardRef: RefObject<HTMLDivElement | null>
  topTrashCardRef: RefObject<HTMLDivElement | null>
  bottomTrashCardRef: RefObject<HTMLDivElement | null>
  topLeaderCardFrameClassName: string
  bottomLeaderCardFrameClassName: string
  gameState: IGameStateResponse
  authUserId?: string
  availableActions: IGameActionOptionResponse[]
  pendingSetSupportCardInstanceId: string | null
  isConnected: boolean
  isActionPending: boolean
  onSelectAction: (action: IGameActionOptionResponse) => void
  onSelectSupportSlotForSet: (slotIndex: number) => void
  onCancelSetSupportSelection: () => void
  onToggleTheme: () => void
  onPassTurn: () => void
}