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
  /**
   * Whether the other seat is on this board right now, drawn as the status dot on the opponent's side. Optional and
   * defaulting to present: an unobserved seat is not an absent one, and callers that do not track presence should not
   * paint a red dot.
   */
  isOpponentPresent?: boolean
  isActionPending: boolean
  isActionBlocked: boolean
  isPresentationPending: boolean
  onSelectAction: (action: IGameActionOptionResponse) => void
  onSelectAttackTarget: (targetCardInstanceId: string) => void
  onConfirmSummonTargetSelection: () => void
  onConfirmEffectTargetSelection: () => void
  onToggleTheme: () => void
  /** Resigns from the game after the confirmation dialog is accepted; resolves false when the server refused. */
  onForfeit: () => Promise<boolean>
  /**
   * Closes a table nobody has joined yet, which retires it and releases its code; resolves false when the server
   * refused because an opponent took the seat while the host was deciding.
   */
  onCloseTable: () => Promise<boolean>
  /** Asks the opponent to let the board go back one move; resolves false when the server refused. */
  onRequestRedo: () => Promise<boolean>
}