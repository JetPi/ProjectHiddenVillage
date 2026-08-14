import { useEffect, useMemo, useRef } from 'react'
import { preloadCardsByIds } from '../../../services/cardPreloadService'
import { preloadImageSources } from '../../../services/imagePreloadCache'
import chakraCardImage from '../../../assets/ChakraCard.webp'
import summonCardImage from '../../../assets/SummonCard.webp'
import cardBackImage from '../../../assets/CardBackside.png'
import { runDeckToHandAnimation, runHandToPileAnimation } from '../utils/functions'
import type { IGameLoaderData } from '../types/routeData'
import type {
  IRevalidatorState,
  IUseAutoAdvancePhaseEffectArgs,
  IUseHandZoneAnimationEffectsArgs,
} from '../types/hooks'
import { buildCardPreloadPayload } from '../utils/functions'
const STATIC_GAME_IMAGE_SOURCES = [chakraCardImage, summonCardImage, cardBackImage]

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

function useCardCatalogPreload(gameCards: IGameLoaderData['gameCards']): void {
  const lastPreloadedSignatureRef = useRef('')
  const preloadPayload = useMemo(() => buildCardPreloadPayload(gameCards), [gameCards])

  function preloadGameImages(cardIds: string[] | null): void {
    if (cardIds && cardIds.length > 0) {
      void preloadCardsByIds(cardIds).catch(() => {
        // Card preloading is best effort and must not block gameplay rendering.
      })
    }

    void preloadImageSources(STATIC_GAME_IMAGE_SOURCES).catch(() => {
      // Static image preloading is best effort and must not block gameplay rendering.
    })
  }

  useEffect(() => {
    if (preloadPayload) {
      const { cardIds, signature } = preloadPayload
      if (signature !== lastPreloadedSignatureRef.current) {
        lastPreloadedSignatureRef.current = signature
        preloadGameImages(cardIds)
      }
    } else {
      preloadGameImages(null)
    }
  }, [preloadPayload])

  useEffect(() => {
    function handleReconnect() {
      preloadGameImages(preloadPayload?.cardIds ?? null)
    }

    window.addEventListener('online', handleReconnect)
    return () => window.removeEventListener('online', handleReconnect)
  }, [preloadPayload])
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

      if (topHandToTrashCards.length > 0 || bottomHandToTrashCards.length > 0) {
        animController.pendingDrawAnimationFrameId = window.requestAnimationFrame(() => {
          topHandToTrashCards.forEach((instanceId, index) => {
            const movementDelay = index * handToPileStaggerMs
            const timeoutId = window.setTimeout(() => {
              runHandToPileAnimation({
                side: 'top',
                destination: 'trash',
                cardInstanceId: instanceId,
                topDeckCardRef,
                bottomDeckCardRef,
                topTrashCardRef,
                bottomTrashCardRef,
                topHandRowRef,
                bottomHandRowRef,
              })
            }, movementDelay)
            animController.pendingDrawTimeoutIds.push(timeoutId)
          })

          bottomHandToTrashCards.forEach((instanceId, index) => {
            const movementDelay = index * handToPileStaggerMs
            const timeoutId = window.setTimeout(() => {
              runHandToPileAnimation({
                side: 'bottom',
                destination: 'trash',
                cardInstanceId: instanceId,
                topDeckCardRef,
                bottomDeckCardRef,
                topTrashCardRef,
                bottomTrashCardRef,
                topHandRowRef,
                bottomHandRowRef,
              })
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
  autoSignalPhases,
  animControllerRef,
  submitHubIntent,
}: IUseAutoAdvancePhaseEffectArgs): void {
  useEffect(() => {
    if (!isConnected || isActionPendingFlag || hasPendingPromptFlag) {
      return
    }

    const hasEnabledAdvancePhaseAction = availableActions.some(
      (action) => action.actionId === 'advance-phase' && action.isEnabled,
    )
    if (!hasEnabledAdvancePhaseAction) {
      return
    }

    if (!autoSignalPhases.has(phase)) {
      return
    }

    const phaseSnapshotKey = `${turnNumber}:${phase}:${activePlayerId}`
    if (animControllerRef.current.lastAutoSignalKey === phaseSnapshotKey) {
      return
    }

    animControllerRef.current.lastAutoSignalKey = phaseSnapshotKey

    const timerId = window.setTimeout(() => {
      if (hasPendingPromptFlag || isActionPendingFlag) {
        return
      }

      void submitHubIntent({ intent: 'advance-phase' })
    }, 0)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [
    activePlayerId,
    animControllerRef,
    autoSignalPhases,
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