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
import { DRAW_TO_HAND_REVEAL_DELAY_MS, DRAW_TO_HAND_STAGGER_MS, HAND_TO_PILE_STAGGER_MS, REVEAL_PRESENTATION_MS } from '@/views/game/utils/contants'
import { runHandToPileAnimation } from '@/views/game/utils/functions/animations'
import { useGameHubStore } from '@/state/gameHubStore'
import type { useGameRefs } from '@/views/game/hooks/GameView/memos/useGameRefs'
import type { IGameUIStoreState, IPendingPromptSelectionState } from '@/state/types/gameUIStore'
import { useBattlefieldCardReorderEffect } from './useBattleFieldCards'
import { useGetMainPhaseActions } from './useGetMainPhaseActions'
import { useAutoAdvancePhaseEffect, useCardCatalogPreload, useCardMoveGhostAnimationEffect, useHandZoneAnimationEffects, useRevealedCardSummonFlightEffect } from './useGameViewEffects'

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

  useRevealedCardSummonFlightEffect({
    currentPlayer,
    opponentPlayer,
    topDeckCardRef: viewRefs.topDeckCardRef,
    bottomDeckCardRef: viewRefs.bottomDeckCardRef,
    boardZoneRef: viewRefs.boardZoneRef,
  })

  usePromptSelectionSubmitEffect({
    gameState,
    pendingPromptSelection: ui.pendingPromptSelection,
    clearPromptSelection: ui.clearPromptSelection,
    submitHubIntent: gameHubState.submitHubIntent,
    viewRefs,
  })

  useRevealPresentationAckEffect({
    isConnected,
    gameState,
    submitHubIntent: gameHubState.submitHubIntent,
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

    if (!pendingPrompt || pendingPrompt.promptId !== selection.promptId) {
      clearPromptSelection()
      return
    }

    const pileDestination = resolveHandPileDestination(pendingPrompt.selectionPromptKind)

    void (async () => {
      // Let the card visibly finish travelling to its pile BEFORE the prompt resolves. The flight animates the
      // real hand element, so submitting first would let the pushed state unmount it mid-air and the card would
      // simply vanish instead of landing.
      if (pendingPrompt.candidateZone === 'Hand' && pileDestination) {
        await runHandToPileAnimation({
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

      clearPromptSelection()

      await submitHubIntent({
        intent: 'resolve-prompt',
        selectedOption: selection.selectedInstanceId,
      })
    })()
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

/**
 * A reveal presentation is not a question: the server suspends a "Reveal First" chain until the player has seen
 * the card it turned over (the deck slot flips it face up meanwhile). The client therefore acknowledges it on its
 * own once the presentation window has passed, using the prompt's single option - the only option a presentation
 * prompt ever has. The ack is re-armed while that same prompt is still pending, because a failed submit would
 * otherwise strand the chain with nothing left to answer it.
 */
function useRevealPresentationAckEffect({
  isConnected,
  gameState,
  submitHubIntent,
}: IUseRevealPresentationAckEffectArgs): void {
  const pendingPrompt = gameState.pendingPrompt
  const promptId = pendingPrompt?.promptId ?? null
  const ackOption =
    pendingPrompt?.selectionPromptKind === 'RevealPresentation' && pendingPrompt.isAwaitingRequestingPlayer
      ? (pendingPrompt.options?.[0] ?? null)
      : null

  useEffect(() => {
    if (!isConnected || !promptId || !ackOption) {
      return
    }

    let isCancelled = false
    let timeoutId = 0

    const scheduleAck = (): void => {
      timeoutId = window.setTimeout(() => {
        void (async () => {
          await submitHubIntent({ intent: 'resolve-prompt', selectedOption: ackOption })

          const isStillPending =
            useGameHubStore.getState().gameState?.pendingPrompt?.promptId === promptId

          if (!isCancelled && isStillPending) {
            scheduleAck()
          }
        })()
      }, REVEAL_PRESENTATION_MS)
    }

    scheduleAck()

    return () => {
      isCancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [ackOption, isConnected, promptId, submitHubIntent])
}

type IUseRevealPresentationAckEffectArgs = {
  isConnected: boolean
  gameState: IGameStateResponse
  submitHubIntent: IUseGameHubStateResult['submitHubIntent']
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
