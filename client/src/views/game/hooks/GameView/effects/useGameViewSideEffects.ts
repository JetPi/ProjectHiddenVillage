import { useMemo, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type {
  IGameActionOptionResponse,
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
import type { useGameUIState } from '@/views/game/hooks/GameView/states/useGameUIState'
import { useLiveCatalogRefresh } from './useLiveCatalogRefresh'
import { useBattlefieldCardReorderEffect } from './useBattleFieldCards'
import { useGetMainPhaseActions } from './useGetMainPhaseActions'
import { usePendingActions } from './usePendingActions'
import { useAvailableActionMapper } from './useAvailableActionMapper'
import { usePendingSummon } from './usePendingSummon'
import { useOptimisticResting } from './useOptimisticResting'
import { useActiveAttackSequence } from './useActiveAttackSequence'
import { useAutoAdvancePhaseEffect, useCardCatalogPreload, useHandZoneAnimationEffects } from './useGameViewEffects'

function useGameViewSideEffects({
  joinCode,
  authUserId,
  gameState,
  gameHubState,
  ui,
  derivedGameState,
  mappedAvailableActions,
  bottomHandCards,
  liveGameCards,
  setLiveGameCards,
  lastRequestedMissingCardIdsKeyRef,
  isCardCatalogRefreshInFlightRef,
  viewRefs,
  animControllerRef,
  currentTopBattlefieldRawCards,
  currentBottomBattlefieldRawCards,
  setTopBattlefieldDisplayOrder,
  setBottomBattlefieldDisplayOrder,
  lastSubmittedAttackSourceRef,
}: IUseGameViewSideEffectsArgs) {
  const { isConnected, isActionPending, actionError, refreshGameState } = gameHubState
  const {
    setBottomHandFaceUpByInstanceId,
    pendingSetSupportCardInstanceId,
    setPendingSetSupportCardInstanceId,
    pendingCardTargeting,
    setPendingCardTargeting,
    pendingSummonTargeting,
    setPendingSummonTargeting,
    setActiveAttackLink,
    setOptimisticRestedByInstanceId,
  } = ui
  const hasPendingPromptFlag = Boolean(gameState.pendingPrompt)
  const players = gameState.players
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
  useCardCatalogPreload(liveGameCards)

  useLiveCatalogRefresh({
    setLiveGameCards,
    liveGameCards,
    players,
    joinCode,
    lastRequestedMissingCardIdsKeyRef,
    isCardCatalogRefreshInFlightRef,
  })

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

  usePendingActions({
    pendingSetSupportCardInstanceId,
    mappedAvailableActions,
    bottomHandCards,
    setPendingSetSupportCardInstanceId,
  })

  useAvailableActionMapper({
    pendingCardTargeting,
    mappedAvailableActions,
    derivedGameState,
    setPendingCardTargeting,
  })

  usePendingSummon({
    pendingSummonTargeting,
    bottomHandCards,
    setPendingSummonTargeting,
  })

  useOptimisticResting({
    gameState,
    setActiveAttackLink,
    setOptimisticRestedByInstanceId,
    lastSubmittedAttackSourceRef,
  })

  useActiveAttackSequence({
    gameState,
    setActiveAttackLink,
    setOptimisticRestedByInstanceId,
    lastSubmittedAttackSourceRef,
    actionError,
  })
}

type IUseGameViewSideEffectsArgs = {
  joinCode: string
  authUserId: string | undefined
  gameState: IGameStateResponse
  gameHubState: IUseGameHubStateResult
  ui: ReturnType<typeof useGameUIState>
  derivedGameState: IDerivedGameViewState
  mappedAvailableActions: IGameActionOptionResponse[]
  bottomHandCards: IGameCardInstanceResponse[]
  liveGameCards: IGameLoaderData['gameCards']
  setLiveGameCards: Dispatch<SetStateAction<IGameLoaderData['gameCards']>>
  lastRequestedMissingCardIdsKeyRef: RefObject<string>
  isCardCatalogRefreshInFlightRef: RefObject<boolean>
  viewRefs: ReturnType<typeof useGameRefs>
  animControllerRef: RefObject<IGameViewAnimController>
  currentTopBattlefieldRawCards: IGameCardInstanceResponse[]
  currentBottomBattlefieldRawCards: IGameCardInstanceResponse[]
  setTopBattlefieldDisplayOrder: Dispatch<SetStateAction<string[]>>
  setBottomBattlefieldDisplayOrder: Dispatch<SetStateAction<string[]>>
  lastSubmittedAttackSourceRef: RefObject<string | null>
}

export { useGameViewSideEffects }

