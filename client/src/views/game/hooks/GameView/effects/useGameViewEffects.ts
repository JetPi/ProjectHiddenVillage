import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useGameHubStore } from '@/state/gameHubStore'
import { preloadCardArtInPriorityBatches, type ICardArtPreloadEntry } from '@/services/cardPreloadService'
import { preloadImageSources } from '@/services/imagePreloadCache'
import { CARD_ART_WIDTHS } from '@/services/api/cardArt'
import type { IGameStateResponse, IGamePlayerStateResponse } from '@/services/api/types/game'
import chakraCardImage from '@/assets/ChakraCard.webp'
import summonCardImage from '@/assets/SummonCard.webp'
import cardBackImage from '@/assets/CardBackside.webp'
import type {
  IGameLoaderData,
  IRevalidatorState,
  IUseAutoAdvancePhaseEffectArgs,
  IUseHandZoneAnimationEffectsArgs,
} from '@/views/game/types'
import { runDeckToHandAnimation, runRectToDynamicElementAnimation } from '@/views/game/utils/functions'
const STATIC_GAME_IMAGE_SOURCES = [chakraCardImage, summonCardImage, cardBackImage]
const AUTO_SIGNAL_PHASES = new Set([
  'DrawInitialHand',
  'RefreshPhase',
  'StartOfMainPhase',
  'DrawPhase',
  'AttackResolution',
  'BattleEndStep',
  'EndStep',
])
const DECK_TO_HAND_FLY_DURATION_MS = 420
const DRAW_ANIMATION_COMPLETE_PADDING_MS = 140
const AUTO_ADVANCE_RECHECK_MS = 80

function useIdleRevalidationPoll(
  revalidatorState: IRevalidatorState,
  revalidate: () => void,
  intervalMs: number,
): void {
  useEffect(() => {
    if (revalidatorState !== 'idle') {
      return
    }

    const timeoutId = window.setTimeout(() => {
      revalidate()
    }, intervalMs)

    return () => window.clearTimeout(timeoutId)
  }, [intervalMs, revalidate, revalidatorState])
}

function collectBoardDefinitionIds(
  player: IGamePlayerStateResponse,
  includeHand: boolean,
): Set<string> {
  const definitionIds = new Set<string>()
  const pushCard = (card: { cardDefinitionId?: string } | null | undefined): void => {
    const cardDefinitionId = card?.cardDefinitionId?.trim()
    if (cardDefinitionId) {
      definitionIds.add(cardDefinitionId)
    }
  }

  pushCard(player.leader)
  for (const zone of [player.characterField, player.supportZone, player.exileZone, player.trash]) {
    for (const card of zone) {
      pushCard(card)
    }
  }

  if (includeHand) {
    for (const card of player.hand) {
      pushCard(card)
    }
  }

  return definitionIds
}

function isSamePlayerId(playerId: string | undefined, candidateId: string | undefined): boolean {
  if (!playerId || !candidateId) {
    return false
  }

  return playerId.trim().toLowerCase() === candidateId.trim().toLowerCase()
}

function buildGameArtPreloadPlan(
  gameCards: IGameLoaderData['gameCards'],
  gameState: IGameStateResponse | null,
  authUserId: string | undefined,
): { visibleCards: ICardArtPreloadEntry[]; remainingCards: ICardArtPreloadEntry[]; signature: string } {
  const visibleDefinitionIds = new Set<string>()

  if (gameState) {
    for (const player of gameState.players) {
      const includeHand = isSamePlayerId(player.playerId, authUserId)
      for (const definitionId of collectBoardDefinitionIds(player, includeHand)) {
        visibleDefinitionIds.add(definitionId)
      }
    }
  }

  const visibleCards: ICardArtPreloadEntry[] = []
  const remainingCards: ICardArtPreloadEntry[] = []
  const visibleSignatureIds: string[] = []
  const remainingSignatureIds: string[] = []
  const seen = new Set<string>()

  for (const card of gameCards) {
    const cardId = card.id?.trim()
    if (!cardId || seen.has(cardId.toLowerCase())) {
      continue
    }

    seen.add(cardId.toLowerCase())
    const entry: ICardArtPreloadEntry = { id: cardId, imageVersion: card.imageVersion }
    if (visibleDefinitionIds.has(cardId)) {
      visibleCards.push(entry)
      visibleSignatureIds.push(cardId)
    } else {
      remainingCards.push(entry)
      remainingSignatureIds.push(cardId)
    }
  }

  const sortedVisibleIds = visibleSignatureIds.map((id) => id.toLowerCase()).sort((a, b) => a.localeCompare(b))
  const sortedRemainingIds = remainingSignatureIds.map((id) => id.toLowerCase()).sort((a, b) => a.localeCompare(b))

  return {
    visibleCards,
    remainingCards,
    signature: `${sortedVisibleIds.join('|')}#${sortedRemainingIds.join('|')}`,
  }
}

function useCardCatalogPreload(
  gameCards: IGameLoaderData['gameCards'],
  gameState: IGameStateResponse | null,
  authUserId: string | undefined,
): void {
  const lastPreloadedSignatureRef = useRef('')
  const preloadPlan = useMemo(
    () => buildGameArtPreloadPlan(gameCards, gameState, authUserId),
    [gameCards, gameState, authUserId],
  )

  const preloadGameImages = useCallback((): void => {
    void preloadCardArtInPriorityBatches([
      { cards: preloadPlan.visibleCards, width: CARD_ART_WIDTHS.board },
      { cards: preloadPlan.visibleCards, width: CARD_ART_WIDTHS.preview },
      { cards: preloadPlan.remainingCards, width: CARD_ART_WIDTHS.board },
    ]).catch(() => {
      // Card preloading is best effort and must not block gameplay rendering.
    })

    void preloadImageSources(STATIC_GAME_IMAGE_SOURCES).catch(() => {
      // Static image preloading is best effort and must not block gameplay rendering.
    })
  }, [preloadPlan])

  useEffect(() => {
    if (preloadPlan.signature !== lastPreloadedSignatureRef.current) {
      lastPreloadedSignatureRef.current = preloadPlan.signature
      preloadGameImages()
    }
  }, [preloadGameImages, preloadPlan])

  useEffect(() => {
    function handleReconnect() {
      preloadGameImages()
    }

    window.addEventListener('online', handleReconnect)
    return () => window.removeEventListener('online', handleReconnect)
  }, [preloadGameImages])
}


function useHandZoneAnimationEffects({
  topHandInstanceIds,
  bottomHandInstanceIds,
  topDeckCount,
  bottomDeckCount,
  topTrashCount,
  bottomTrashCount,
  drawToHandStaggerMs,
  drawToHandRevealDelayMs,
  handToPileStaggerMs,
  topDeckCardRef,
  bottomDeckCardRef,
  topTrashCardRef,
  bottomTrashCardRef,
  topHandRowRef,
  bottomHandRowRef,
  animControllerRef,
  setBottomHandFaceUpByInstanceId,
}: IUseHandZoneAnimationEffectsArgs): void {
  useEffect(() => {
    const animController = animControllerRef.current
    const previousSnapshot = animController.previousHandZoneSnapshot
    const nextTopHandInstanceIdSet = new Set(topHandInstanceIds)
    const nextBottomHandInstanceIdSet = new Set(bottomHandInstanceIds)

    if (previousSnapshot.isInitialized) {
      const newTopHandCards = topHandInstanceIds.filter((instanceId) => !previousSnapshot.topHandInstanceIds.has(instanceId))
      const newBottomHandCards = bottomHandInstanceIds.filter((instanceId) => !previousSnapshot.bottomHandInstanceIds.has(instanceId))
      const removedTopHandCards = [...previousSnapshot.topHandInstanceIds].filter((instanceId) => !nextTopHandInstanceIdSet.has(instanceId))
      const removedBottomHandCards = [...previousSnapshot.bottomHandInstanceIds].filter((instanceId) => !nextBottomHandInstanceIdSet.has(instanceId))
      const topDeckDecrease = Math.max(previousSnapshot.topDeckCount - topDeckCount, 0)
      const bottomDeckDecrease = Math.max(previousSnapshot.bottomDeckCount - bottomDeckCount, 0)
      const topTrashIncrease = Math.max(topTrashCount - previousSnapshot.topTrashCount, 0)
      const bottomTrashIncrease = Math.max(bottomTrashCount - previousSnapshot.bottomTrashCount, 0)
      const topDeckToHandCards = newTopHandCards.slice(0, topDeckDecrease)
      const bottomDeckToHandCards = animController.pendingMulliganDrawReplay
        ? bottomHandInstanceIds
        : newBottomHandCards.slice(0, bottomDeckDecrease)
      const topHandToTrashCards = removedTopHandCards.slice(0, topTrashIncrease)
      const bottomHandToTrashCards = removedBottomHandCards.slice(0, bottomTrashIncrease)

      if (animController.pendingMulliganDrawReplay) {
        animController.pendingMulliganDrawReplay = false
      }

      function runInferredHandToTrashAnimation(side: 'top' | 'bottom', cardInstanceId: string): void {
        const sourceHandRowElement = side === 'top' ? topHandRowRef.current : bottomHandRowRef.current
        const sourceCardElement = sourceHandRowElement?.querySelector<HTMLDivElement>(
          `[data-hand-instance-id="${cardInstanceId}"]`,
        ) ?? null

        if (!sourceCardElement) {
          return
        }

        const sourceRect = sourceCardElement.getBoundingClientRect()
        if (sourceRect.width <= 0 || sourceRect.height <= 0) {
          return
        }

        void runRectToDynamicElementAnimation({
          sourceRect,
          durationMs: 340,
          resolveDestinationElement: () => {
            return side === 'top' ? topTrashCardRef.current : bottomTrashCardRef.current
          },
          resolveFallbackElement: () => {
            return side === 'top' ? topTrashCardRef.current : bottomTrashCardRef.current
          },
        })
      }

      if (topHandToTrashCards.length > 0 || bottomHandToTrashCards.length > 0) {
        animController.pendingDrawAnimationFrameId = window.requestAnimationFrame(() => {
          topHandToTrashCards.forEach((instanceId, index) => {
            const movementDelay = index * handToPileStaggerMs
            const timeoutId = window.setTimeout(() => {
              runInferredHandToTrashAnimation('top', instanceId)
            }, movementDelay)
            animController.pendingDrawTimeoutIds.push(timeoutId)
          })

          bottomHandToTrashCards.forEach((instanceId, index) => {
            const movementDelay = index * handToPileStaggerMs
            const timeoutId = window.setTimeout(() => {
              runInferredHandToTrashAnimation('bottom', instanceId)
            }, movementDelay)
            animController.pendingDrawTimeoutIds.push(timeoutId)
          })
        })
      }

      if (bottomDeckToHandCards.length > 0) {
        setBottomHandFaceUpByInstanceId((previousState) => {
          const nextState: Record<string, boolean> = {}

          for (const instanceId of bottomHandInstanceIds) {
            nextState[instanceId] = previousState[instanceId] ?? true
          }

          for (const instanceId of bottomDeckToHandCards) {
            nextState[instanceId] = false
          }

          return nextState
        })
      }

      if (topDeckToHandCards.length > 0 || bottomDeckToHandCards.length > 0) {
        const lastDeckToHandIndex = Math.max(
          topDeckToHandCards.length > 0 ? topDeckToHandCards.length - 1 : -1,
          bottomDeckToHandCards.length > 0 ? bottomDeckToHandCards.length - 1 : -1,
        )
        animController.drawAnimationEndsAt = Date.now()
          + Math.max(lastDeckToHandIndex, 0) * drawToHandStaggerMs
          + DECK_TO_HAND_FLY_DURATION_MS
          + drawToHandRevealDelayMs
          + DRAW_ANIMATION_COMPLETE_PADDING_MS

        animController.pendingDrawAnimationFrameId = window.requestAnimationFrame(() => {
          topDeckToHandCards.forEach((instanceId, index) => {
            const movementDelay = index * drawToHandStaggerMs
            const timeoutId = window.setTimeout(() => {
              runDeckToHandAnimation({
                side: 'top',
                cardInstanceId: instanceId,
                topDeckCardRef,
                bottomDeckCardRef,
                topHandRowRef,
                bottomHandRowRef,
              })
            }, movementDelay)
            animController.pendingDrawTimeoutIds.push(timeoutId)
          })

          bottomDeckToHandCards.forEach((instanceId, index) => {
            const movementDelay = index * drawToHandStaggerMs
            const movementTimeoutId = window.setTimeout(() => {
              runDeckToHandAnimation({
                side: 'bottom',
                cardInstanceId: instanceId,
                topDeckCardRef,
                bottomDeckCardRef,
                topHandRowRef,
                bottomHandRowRef,
              })
            }, movementDelay)

            const revealTimeoutId = window.setTimeout(() => {
              setBottomHandFaceUpByInstanceId((previousState) => {
                if (!(instanceId in previousState)) {
                  return previousState
                }

                return {
                  ...previousState,
                  [instanceId]: true,
                }
              })
            }, movementDelay + drawToHandRevealDelayMs)
            animController.pendingDrawTimeoutIds.push(movementTimeoutId, revealTimeoutId)
          })
        })
      }
    }

    setBottomHandFaceUpByInstanceId((previousState) => {
      const nextState: Record<string, boolean> = {}
      for (const instanceId of bottomHandInstanceIds) {
        nextState[instanceId] = previousState[instanceId] ?? true
      }

      return nextState
    })

    animController.previousHandZoneSnapshot = {
      topHandInstanceIds: new Set(topHandInstanceIds),
      bottomHandInstanceIds: new Set(bottomHandInstanceIds),
      topDeckCount,
      bottomDeckCount,
      topTrashCount,
      bottomTrashCount,
      isInitialized: true,
    }
  }, [
    bottomDeckCount,
    bottomHandInstanceIds,
    bottomTrashCount,
    drawToHandRevealDelayMs,
    drawToHandStaggerMs,
    handToPileStaggerMs,
    topDeckCount,
    topHandInstanceIds,
    topTrashCount,
    animControllerRef,
    setBottomHandFaceUpByInstanceId,
    topDeckCardRef,
    bottomDeckCardRef,
    topTrashCardRef,
    bottomTrashCardRef,
    topHandRowRef,
    bottomHandRowRef,
  ])

  useEffect(() => {
    const animController = animControllerRef.current

    return () => {
      if (animController.pendingDrawAnimationFrameId !== null) {
        window.cancelAnimationFrame(animController.pendingDrawAnimationFrameId)
      }

      animController.pendingDrawTimeoutIds.forEach((timeoutId) => {
        window.clearTimeout(timeoutId)
      })
      animController.pendingDrawTimeoutIds = []
    }
  }, [animControllerRef])
}

function useAutoAdvancePhaseEffect({
  isConnected,
  isActionPendingFlag,
  hasPendingPromptFlag,
  availableActions,
  phase,
  turnNumber,
  activePlayerId,
  animControllerRef,
  submitHubIntent,
}: IUseAutoAdvancePhaseEffectArgs): void {
  const advanceTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const animController = animControllerRef.current

    function clearPendingAdvanceTimer(): void {
      if (advanceTimerRef.current !== null) {
        window.clearTimeout(advanceTimerRef.current)
        advanceTimerRef.current = null
      }
    }

    clearPendingAdvanceTimer()

    if (!isConnected || isActionPendingFlag || hasPendingPromptFlag) {
      return
    }

    const hasEnabledAdvancePhaseAction = availableActions.some(
      (action) => action.actionId === 'advance-phase' && action.isEnabled,
    )
    
    if (!hasEnabledAdvancePhaseAction) {
      return
    }

    if (!AUTO_SIGNAL_PHASES.has(phase)) {
      return
    }

    const phaseSnapshotKey = `${turnNumber}:${phase}:${activePlayerId}`
    if (animController.lastAutoSignalKey === phaseSnapshotKey) {
      return
    }

    // The initial hand deal, per-turn draws, and mulligan re-draws all animate
    // cards from the deck into the hand. Auto-advancing to the next phase while
    // one of those animations is still in flight would cut it, so every auto
    // signal waits until the last scheduled deck→hand animation has finished.
    // The signal is re-armed until it actually dispatches, so the user should
    // never have to click an "Advance Phase" button in these flows.
    function isDrawAnimationInFlight(): boolean {
      return animController.drawAnimationEndsAt !== null && Date.now() < animController.drawAnimationEndsAt
    }

    function scheduleAutoAdvance(): void {
      const drawAnimationEndsAt = animController.drawAnimationEndsAt
      const waitDelayMs = drawAnimationEndsAt === null
        ? AUTO_ADVANCE_RECHECK_MS
        : Math.max(AUTO_ADVANCE_RECHECK_MS, drawAnimationEndsAt - Date.now())

      advanceTimerRef.current = window.setTimeout(() => {
        advanceTimerRef.current = null
        dispatchAutoAdvance()
      }, waitDelayMs)
    }

    function dispatchAutoAdvance(): void {
      const currentStoreState = useGameHubStore.getState()
      const isDispatchBlocked = currentStoreState.isActionPending
        || Boolean(currentStoreState.gameState?.pendingPrompt)
        || isDrawAnimationInFlight()

      if (isDispatchBlocked) {
        scheduleAutoAdvance()
        return
      }

      advanceTimerRef.current = null
      animController.lastAutoSignalKey = phaseSnapshotKey
      void submitHubIntent({ intent: 'advance-phase' })
    }

    scheduleAutoAdvance()
    return clearPendingAdvanceTimer
  }, [
    activePlayerId,
    animControllerRef,
    availableActions,
    hasPendingPromptFlag,
    isActionPendingFlag,
    isConnected,
    phase,
    submitHubIntent,
    turnNumber,
  ])
}

export {
  useIdleRevalidationPoll,
  useCardCatalogPreload,
  useHandZoneAnimationEffects,
  useAutoAdvancePhaseEffect,
}