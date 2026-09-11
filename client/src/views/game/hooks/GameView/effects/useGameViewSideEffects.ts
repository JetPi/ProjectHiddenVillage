import { useMemo, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type {
  IGameCardInstanceResponse,
  IGameStateResponse,
} from '@/services/api/types/game'
import type {
  IDerivedGameViewState,
  IGameLoaderData,
  IGameViewAnimController,
  IUseGameHubStateResult,
} from '@/views/game/types'
import { DRAW_TO_HAND_REVEAL_DELAY_MS, DRAW_TO_HAND_STAGGER_MS, HAND_TO_PILE_STAGGER_MS } from '@/views/game/utils/contants'
import type { useGameRefs } from '@/views/game/hooks/GameView/memos/useGameRefs'
import type { IGameUIStoreState } from '@/state/types/gameUIStore'
import { useBattlefieldCardReorderEffect } from './useBattleFieldCards'
import { useGetMainPhaseActions } from './useGetMainPhaseActions'
import { useAutoAdvancePhaseEffect, useCardCatalogPreload, useHandZoneAnimationEffects } from './useGameViewEffects'

function useGameViewSideEffects({
  authUserId,
  gameState,
  gameHubState,
  ui,
  derivedGameState,
  bottomHandCards,
  liveGameCards,
  viewRefs,
  animControllerRef,
  currentTopBattlefieldRawCards,
  currentBottomBattlefieldRawCards,
  setTopBattlefieldDisplayOrder,
  setBottomBattlefieldDisplayOrder,
}: IUseGameViewSideEffectsArgs) {
  const { isConnected, isActionPending, refreshGameState } = gameHubState
  const { setBottomHandFaceUpByInstanceId } = ui
  const hasPendingPromptFlag = Boolean(gameState.pendingPrompt)
  const opponentPlayer = derivedGameState.opponentPlayer
  const currentPlayer = derivedGameState.currentPlayer
  const topHandInstanceIds = useMemo(
    () => (opponentPlayer?.hand ?? []).map((card) => card.instanceId),
    [opponentPlayer?.hand],
  )
  const bottomHandInstanceIds = useMemo(
    () => (currentPlayer?.hand ?? []).map((card) => card.instanceId),
    [currentPlayer?.hand],
  )
  const topDeckCount = opponentPlayer?.deckCount ?? 0
  const bottomDeckCount = currentPlayer?.deckCount ?? 0
  const topTrashCount = opponentPlayer?.trash.length ?? 0
  const bottomTrashCount = currentPlayer?.trash.length ?? 0

  useCardCatalogPreload(liveGameCards, gameState, authUserId)

  useHandZoneAnimationEffects({
    topHandInstanceIds,
    bottomHandInstanceIds,
    topDeckCount,
    bottomDeckCount,
    topTrashCount,
    bottomTrashCount,
    drawToHandStaggerMs: DRAW_TO_HAND_STAGGER_MS,
    drawToHandRevealDelayMs: DRAW_TO_HAND_REVEAL_DELAY_MS,
    handToPileStaggerMs: HAND_TO_PILE_STAGGER_MS,
    topDeckCardRef: viewRefs.topDeckCardRef,
    bottomDeckCardRef: viewRefs.bottomDeckCardRef,
    topTrashCardRef: viewRefs.topTrashCardRef,
    bottomTrashCardRef: viewRefs.bottomTrashCardRef,
    topHandRowRef: viewRefs.topHandRowRef,
    bottomHandRowRef: viewRefs.bottomHandRowRef,
    animControllerRef,
    setBottomHandFaceUpByInstanceId,
  })

  useAutoAdvancePhaseEffect({
    isConnected,
    isActionPendingFlag: isActionPending,
    hasPendingPromptFlag,
    availableActions: gameState.availableActions,
    phase: gameState.phase,
    turnNumber: gameState.turnNumber,
    activePlayerId: gameState.activePlayerId,
    animControllerRef,
    submitHubIntent: gameHubState.submitHubIntent,
  })

  useBattlefieldCardReorderEffect(currentTopBattlefieldRawCards, setTopBattlefieldDisplayOrder)
  useBattlefieldCardReorderEffect(currentBottomBattlefieldRawCards, setBottomBattlefieldDisplayOrder)

  useGetMainPhaseActions({
    gameHubState,
    derivedGameState,
    authUserId,
    isActionPending,
    hasPendingPromptFlag,
    bottomHandCards,
    refreshGameState,
  })
}

type IUseGameViewSideEffectsArgs = {
  authUserId: string | undefined
  gameState: IGameStateResponse
  gameHubState: IUseGameHubStateResult
  ui: IGameUIStoreState
  derivedGameState: IDerivedGameViewState
  bottomHandCards: IGameCardInstanceResponse[]
  liveGameCards: IGameLoaderData['gameCards']
  viewRefs: ReturnType<typeof useGameRefs>
  animControllerRef: RefObject<IGameViewAnimController>
  currentTopBattlefieldRawCards: IGameCardInstanceResponse[]
  currentBottomBattlefieldRawCards: IGameCardInstanceResponse[]
  setTopBattlefieldDisplayOrder: Dispatch<SetStateAction<string[]>>
  setBottomBattlefieldDisplayOrder: Dispatch<SetStateAction<string[]>>
}

export { useGameViewSideEffects }
