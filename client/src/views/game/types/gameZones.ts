import type { RefObject } from 'react'
import type { IGameStateResponse } from '@/services/api/gameApi'
import type { IGameActionOptionResponse, IGameCardInstanceResponse } from '@/services/api/types/game'
import type { IAttackFlowLinkState, IAttackTargetingState } from '@/views/game/types/attackTargeting'
import type { IDerivedGameViewState } from '@/views/game/types/viewModels'

export type IGameZonesProps = {
  boardZoneRef: RefObject<HTMLDivElement | null>
  joinCode: string
  derivedGameState: IDerivedGameViewState
  topBattlefieldCardsOverride?: IGameCardInstanceResponse[]
  bottomBattlefieldCardsOverride?: IGameCardInstanceResponse[]
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
  pendingAttackTargeting: IAttackTargetingState | null
  optimisticRestedByInstanceId: Record<string, boolean>
  activeAttackLink: IAttackFlowLinkState | null
  isBattleActionTargeting: boolean
  isConnected: boolean
  isActionPending: boolean
  onSelectAction: (action: IGameActionOptionResponse) => void
  onSelectSupportSlotForSet: (slotIndex: number) => void
  onCancelSetSupportSelection: () => void
  onSelectAttackTarget: (targetCardInstanceId: string) => void
  onCancelAttackTargetSelection: () => void
  onToggleTheme: () => void
  onPassTurn: () => void
}