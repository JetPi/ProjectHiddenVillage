import type { RefObject } from 'react'
import type { IGameStateResponse } from '../../../services/api/gameApi'
import type { IGameActionOptionResponse } from '../../../services/api/types/game'
import type { IDerivedGameViewState } from './viewModels'

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
  isConnected: boolean
  isActionPending: boolean
  onSelectAction: (action: IGameActionOptionResponse) => void
  onToggleTheme: () => void
  onPassTurn: () => void
}