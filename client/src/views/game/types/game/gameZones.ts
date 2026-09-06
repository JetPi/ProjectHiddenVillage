import type { RefCallback } from 'react'
import type { IGameStateResponse } from '@/services/api/gameApi'
import type { IGameActionOptionResponse, IGameCardInstanceResponse } from '@/services/api/types/game'
import type { resolveNonLeaderCards } from '@/views/game/utils/functions'
import type { IAttackFlowLinkState, IAttackTargetingState } from '@/views/game/types/targeting/attackTargeting'
import type { ISummonTargetingState } from '@/views/game/types/targeting/summonTargeting'
import type { IDerivedGameViewState } from '@/views/game/types/hub/viewModels'

export type IZoneCardSlotsProps = {
    cards: ReturnType<typeof resolveNonLeaderCards>,
    zone: 'support',
    visibilityMode: 'hover',
    isCurrentPlayerZone: boolean,
    validBattleTargetsByCardId: Set<string>,
    validSummonTargetsByCardId: Set<string>,
    selectedSummonTargetsByCardId: Set<string>,
    props: IGameZonesProps,
  }

export type IGameZonesProps = {
  boardZoneRef: RefCallback<HTMLDivElement>
  joinCode: string
  derivedGameState: IDerivedGameViewState
  topBattlefieldCardsOverride?: IGameCardInstanceResponse[]
  bottomBattlefieldCardsOverride?: IGameCardInstanceResponse[]
  topDeckCardRef: RefCallback<HTMLDivElement>
  bottomDeckCardRef: RefCallback<HTMLDivElement>
  topTrashCardRef: RefCallback<HTMLDivElement>
  bottomTrashCardRef: RefCallback<HTMLDivElement>
  topLeaderCardFrameClassName: string
  bottomLeaderCardFrameClassName: string
  gameState: IGameStateResponse
  authUserId?: string
  availableActions: IGameActionOptionResponse[]
  pendingSetSupportCardInstanceId: string | null
  pendingAttackTargeting: IAttackTargetingState | null
  pendingSummonTargeting: ISummonTargetingState | null
  optimisticRestedByInstanceId: Record<string, boolean>
  activeAttackLink: IAttackFlowLinkState | null
  isBattleActionTargeting: boolean
  isSummonActionTargeting: boolean
  isConnected: boolean
  isActionPending: boolean
  onSelectAction: (action: IGameActionOptionResponse) => void
  onSelectSupportSlotForSet: (slotIndex: number) => void
  onCancelSetSupportSelection: () => void
  onSelectAttackTarget: (targetCardInstanceId: string) => void
  onCancelAttackTargetSelection: () => void
  onToggleSummonTarget: (targetCardInstanceId: string) => void
  canConfirmSummonTargetSelection: boolean
  onConfirmSummonTargetSelection: () => void
  onCancelSummonTargetSelection: () => void
  onToggleTheme: () => void
  onPassTurn: () => void
}