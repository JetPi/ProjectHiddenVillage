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
    validEffectTargetsByCardId: Set<string>,
    selectedEffectTargetsByCardId: Set<string>,
    summonRequirementTextByCardInstanceId: ReadonlyMap<string, string>,
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
  /**
   * Whether an action is currently in flight, held at its last interactive value while the engine holds a phase
   * presentation (see `useRetainedActionBlocked`) so the sidebar does not dim and undim during a transition.
   */
  isActionBlocked: boolean
  /**
   * True while the engine is holding a phase presentation this board is answering. The sidebar keeps its last
   * interactive look but goes inert - a click would land on a phase that already moved.
   */
  isPresentationPending: boolean
  onSelectAction: (action: IGameActionOptionResponse) => void
  onSelectAttackTarget: (targetCardInstanceId: string) => void
  onConfirmSummonTargetSelection: () => void
  onConfirmEffectTargetSelection: () => void
  onToggleTheme: () => void
  onPassTurn: () => void
}