import type { RefCallback } from 'react'
import type { IGameStateResponse } from '@/services/api/gameApi'
import type { IGameActionOptionResponse, IGameCardInstanceResponse } from '@/services/api/types/game'
import type { resolveNonLeaderCards } from '@/views/game/utils/functions'
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
  isConnected: boolean
  isActionPending: boolean
  onSelectAction: (action: IGameActionOptionResponse) => void
  onSelectSupportSlotForSet: (slotIndex: number) => void
  onSelectAttackTarget: (targetCardInstanceId: string) => void
  onConfirmSummonTargetSelection: () => void
  onToggleTheme: () => void
  onPassTurn: () => void
}