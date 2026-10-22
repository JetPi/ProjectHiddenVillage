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
import { runHandToPileAnimation } from '@/views/game/animation'
import { useGameHubStore } from '@/state/gameHubStore'
import type { useGameRefs } from '@/views/game/hooks/GameView/memos/useGameRefs'
import type { IGameUIStoreState, IPendingPromptSelectionState } from '@/state/types/gameUIStore'
import { useBattlefieldCardReorderEffect } from './useBattleFieldCards'
import { useGetMainPhaseActions } from './useGetMainPhaseActions'
import { useCardCatalogPreload, useCardMoveGhostAnimationEffect, useDeckSummonFlightEffect, useHandZoneAnimationEffects, usePhasePresentationAckEffect, useSupportSummonFlightEffect, useTrashRecallSummonFlightEffect } from './useGameViewEffects'
import { useAttackLungeEffect } from './useAttackLungeEffect'

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
  // The two rows a support-zone summon moves a card between, on both sides. It is the support row's own snapshot
  // key: the arrival effect has to re-read it on every commit that can move a card out of (or into) a support slot.
  // Every label is load-bearing: a bare list of ids reads the same whether a card sits in `bottomSupport` or in
  // `bottomField`, which is exactly the move this key has to notice.
  const supportSummonSignature = useMemo(
    () => [
      `top-support:${topPlayerCardInstanceIds.supportZone.join(',')}`,
      `top-field:${topPlayerCardInstanceIds.characterField.join(',')}`,
      `bottom-support:${bottomPlayerCardInstanceIds.supportZone.join(',')}`,
      `bottom-field:${bottomPlayerCardInstanceIds.characterField.join(',')}`,
    ].join('|'),
    [bottomPlayerCardInstanceIds, topPlayerCardInstanceIds],
  )

  useCardCatalogPreload(liveGameCards, gameState, authUserId)

  useHandZoneAnimationEffects({
    topHandInstanceIds,
    bottomHandInstanceIds,
    topDeckCount,
    bottomDeckCount,
    topTrashCount,
    bottomTrashCount,
    topTrashInstanceIds: topPlayerCardInstanceIds.trash,
    bottomTrashInstanceIds: bottomPlayerCardInstanceIds.trash,
    drawToHandStaggerMs: DRAW_TO_HAND_STAGGER_MS,
    drawToHandRevealDelayMs: DRAW_TO_HAND_REVEAL_DELAY_MS,
    handToPileStaggerMs: HAND_TO_PILE_STAGGER_MS,
    animationEvents: gameState.animationEvents,
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

  useDeckSummonFlightEffect({
    currentPlayer,
    opponentPlayer,
    topDeckCardRef: viewRefs.topDeckCardRef,
    bottomDeckCardRef: viewRefs.bottomDeckCardRef,
    boardZoneRef: viewRefs.boardZoneRef,
    animationEvents: gameState.animationEvents,
    animControllerRef,
  })

  useTrashRecallSummonFlightEffect({
    currentPlayer,
    opponentPlayer,
    topTrashCardRef: viewRefs.topTrashCardRef,
    bottomTrashCardRef: viewRefs.bottomTrashCardRef,
    boardZoneRef: viewRefs.boardZoneRef,
  })

  useSupportSummonFlightEffect({
    boardZoneRef: viewRefs.boardZoneRef,
    supportSummonSignature,
  })

  usePromptSelectionSubmitEffect({
    gameState,
    pendingPromptSelection: ui.pendingPromptSelection,
    clearPromptSelection: ui.clearPromptSelection,
    submitHubIntent: gameHubState.submitHubIntent,
    viewRefs,
    animControllerRef,
  })

  useRevealPresentationAckEffect({
    isConnected,
    gameState,
    submitHubIntent: gameHubState.submitHubIntent,
  })

  usePhasePresentationAckEffect({
    isConnected,
    authUserId,
    pendingPresentation: gameState.pendingPresentation,
    acknowledgePhasePresentation: gameHubState.acknowledgePhasePresentation,
  })

  useAttackLungeEffect({
    pendingPresentation: gameState.pendingPresentation,
    attackVisualState: gameState.pendingAttackVisualState,
    boardZoneRef: viewRefs.boardZoneRef,
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

function usePromptSelectionSubmitEffect({
  gameState,
  pendingPromptSelection,
  clearPromptSelection,
  submitHubIntent,
  viewRefs,
  animControllerRef,
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
      if (pendingPrompt.candidateZone === 'Hand' && pileDestination) {
        if (pileDestination === 'trash') {
          animControllerRef.current.suppressedExitGhostInstanceIds.add(selection.selectedInstanceId)
        }

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
  }, [animControllerRef, clearPromptSelection, gameState.pendingPrompt, pendingPromptSelection, submitHubIntent, viewRefs])
}

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
  animControllerRef: RefObject<IGameViewAnimController>
}

type IUseGameViewUIStoreSlice = Pick<
  IGameUIStoreState,
  'setBottomHandFaceUpByInstanceId' | 'pendingPromptSelection' | 'clearPromptSelection'
>

type IUseGameViewSideEffectsArgs = {
  authUserId: string | undefined
  gameState: IGameStateResponse
  gameHubState: IUseGameHubStateResult
  ui: IUseGameViewUIStoreSlice
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
