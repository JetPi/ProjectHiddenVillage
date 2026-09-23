import { useEffect, useMemo, type Dispatch, type RefObject, type SetStateAction } from 'react'
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
import { runHandToPileAnimation } from '@/views/game/utils/functions/animations'
import type { useGameRefs } from '@/views/game/hooks/GameView/memos/useGameRefs'
import type { IGameUIStoreState, IPendingPromptSelectionState } from '@/state/types/gameUIStore'
import { useBattlefieldCardReorderEffect } from './useBattleFieldCards'
import { useGetMainPhaseActions } from './useGetMainPhaseActions'
import { useAutoAdvancePhaseEffect, useCardCatalogPreload, useCardMoveGhostAnimationEffect, useHandZoneAnimationEffects } from './useGameViewEffects'

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
  const topPlayerCardInstanceIds = useMemo(
    () => ({
      characterField: (opponentPlayer?.characterField ?? []).map((card) => card.instanceId),
      supportZone: (opponentPlayer?.supportZone ?? []).map((card) => card.instanceId),
      hand: topHandInstanceIds,
      trash: (opponentPlayer?.trash ?? []).map((card) => card.instanceId),
    }),
    [opponentPlayer?.characterField, opponentPlayer?.supportZone, opponentPlayer?.trash, topHandInstanceIds],
  )
  const bottomPlayerCardInstanceIds = useMemo(
    () => ({
      characterField: (currentPlayer?.characterField ?? []).map((card) => card.instanceId),
      supportZone: (currentPlayer?.supportZone ?? []).map((card) => card.instanceId),
      hand: bottomHandInstanceIds,
      trash: (currentPlayer?.trash ?? []).map((card) => card.instanceId),
    }),
    [currentPlayer?.characterField, currentPlayer?.supportZone, currentPlayer?.trash, bottomHandInstanceIds],
  )

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

  useCardMoveGhostAnimationEffect({
    topPlayerCardInstanceIds,
    bottomPlayerCardInstanceIds,
    boardZoneRef: viewRefs.boardZoneRef,
    topHandRowRef: viewRefs.topHandRowRef,
    bottomHandRowRef: viewRefs.bottomHandRowRef,
    topTrashCardRef: viewRefs.topTrashCardRef,
    bottomTrashCardRef: viewRefs.bottomTrashCardRef,
    animControllerRef,
  })

  usePromptSelectionSubmitEffect({
    gameState,
    pendingPromptSelection: ui.pendingPromptSelection,
    clearPromptSelection: ui.clearPromptSelection,
    submitHubIntent: gameHubState.submitHubIntent,
    viewRefs,
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

/**
 * Submits the card the player picked on a prompt's own Select button. Board clicks only record the pick (the
 * rows call the store directly, per the interaction-state boundary), so the hub submission happens here,
 * together with the flight the pick should show: a hand card on its way to the deck or the trash. A deck
 * search needs no flight here - the hand-zone effect already flies the searched card out of the deck once the
 * resolved state arrives.
 */
function usePromptSelectionSubmitEffect({
  gameState,
  pendingPromptSelection,
  clearPromptSelection,
  submitHubIntent,
  viewRefs,
}: IUsePromptSelectionSubmitEffectArgs): void {
  useEffect(() => {
    if (!pendingPromptSelection) {
      return
    }

    const selection = pendingPromptSelection
    const pendingPrompt = gameState.pendingPrompt

    // Consume the pick straight away: it is a one-shot answer, and the pruner treats a pick whose prompt is
    // gone as stale.
    clearPromptSelection()

    if (!pendingPrompt || pendingPrompt.promptId !== selection.promptId) {
      return
    }

    const pileDestination = resolveHandPileDestination(pendingPrompt.selectionPromptKind)
    if (pendingPrompt.candidateZone === 'Hand' && pileDestination) {
      void runHandToPileAnimation({
        side: 'bottom',
        destination: pileDestination,
        cardInstanceId: selection.selectedInstanceId,
        topDeckCardRef: viewRefs.topDeckCardRef,
        bottomDeckCardRef: viewRefs.bottomDeckCardRef,
        topTrashCardRef: viewRefs.topTrashCardRef,
        bottomTrashCardRef: viewRefs.bottomTrashCardRef,
        topHandRowRef: viewRefs.topHandRowRef,
        bottomHandRowRef: viewRefs.bottomHandRowRef,
      })
    }

    void submitHubIntent({
      intent: 'resolve-prompt',
      selectedOption: selection.selectedInstanceId,
    })
  }, [clearPromptSelection, gameState.pendingPrompt, pendingPromptSelection, submitHubIntent, viewRefs])
}

/** Which pile a hand card picked by a prompt leaves for (null when the prompt's action moves no hand card). */
function resolveHandPileDestination(selectionPromptKind: string | null | undefined): 'deck' | 'trash' | null {
  switch (selectionPromptKind) {
    case 'PlaceOnDeckTop':
    case 'PlaceOnDeckBottom':
      return 'deck'
    case 'DiscardFromHand':
      return 'trash'
    default:
      return null
  }
}

type IUsePromptSelectionSubmitEffectArgs = {
  gameState: IGameStateResponse
  pendingPromptSelection: IPendingPromptSelectionState | null
  clearPromptSelection: () => void
  submitHubIntent: IUseGameHubStateResult['submitHubIntent']
  viewRefs: ReturnType<typeof useGameRefs>
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
