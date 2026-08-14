import { useEffect, useRef, useState } from 'react'
import { useLoaderData } from 'react-router-dom'
import { Lightbulb, RotateCcw, ScrollText, SkipForward } from 'lucide-react'
import { PageShell } from '../../components/layout/PageShell'
import { Panel } from '../../components/ui/Panel'
import { AppButton } from '../../components/ui/AppButton'
import { CardBack } from '../../components/ui/CardBack'
import { CardImage } from '../../components/ui/CardImage'
import { FlippableCard } from '../../components/ui/FlippableCard'
import { PlayPileZone } from '../../components/ui/PlayPileZone'
import { PlayResourceTracker } from '../../components/ui/PlayResourceTracker'
import { PlayRow } from '../../components/ui/PlayRow'
import { SupportCardZone } from '../../components/ui/SupportCardZone'
import { LeaderCard } from '../../components/ui/LeaderCard'
import { useAuthSessionStore } from '../../state/authSession'
import { useThemeStore } from '../../state/themeStore'
import { useAlignedSplit } from './useAlignedSplit'
import { buildLeaderCardFrameClass, mapActionToHubIntent } from './utils/functions'
import { toPromptPresentation } from './utils/promptPresentation'
import type { IGameLoaderData } from './types/routeData'
import type { IGameActionOptionResponse } from '../../services/api/types/game'
import type { IDeckToHandAnimationArgs, IHandToPileAnimationArgs, IHandZoneSnapshot } from './types/animations'
import { useCardCatalogPreload } from './hooks/useGameViewEffects'
import { useDerivedGameViewState } from './hooks/useDerivedGameViewState'
import { useGameHubState } from './hooks/useGameHubState'
import { GamePromptOverlay } from './components/GamePromptOverlay'
import { GamePhaseIndicator } from './components/GamePhaseIndicator'
import {
  GAMEBOARD_MAX_WIDTH_CLASS,
  GAMEBOARD_COLUMNS_CLASS,
  LEADER_CARD_FRAME_CLASS,
  LEADER_CARD_IMAGE_CLASS,
} from './utils/contants'


export function GameView() {
  const DRAW_TO_HAND_STAGGER_MS = 70
  const DRAW_TO_HAND_REVEAL_DELAY_MS = 220
  const HAND_TO_PILE_STAGGER_MS = 60
  const HAND_TO_PILE_DURATION_MS = 340

  const AUTO_SIGNAL_PHASES = new Set([
    'DrawInitialHand',
    'RefreshPhase',
    'StartOfMainPhase',
    'DrawPhase',
    'AttackDeclaration',
    'AttackResolution',
    'BattleEndStep',
  ])

  const { outerRef: outerZoneRef, innerRef: boardZoneRef } = useAlignedSplit()
  const lastAutoSignalKeyRef = useRef('')
  const hasPendingPromptRef = useRef(false)
  const isActionPendingRef = useRef(false)
  const topDeckCardRef = useRef<HTMLDivElement | null>(null)
  const bottomDeckCardRef = useRef<HTMLDivElement | null>(null)
  const topTrashCardRef = useRef<HTMLDivElement | null>(null)
  const bottomTrashCardRef = useRef<HTMLDivElement | null>(null)
  const topHandRowRef = useRef<HTMLDivElement | null>(null)
  const bottomHandRowRef = useRef<HTMLDivElement | null>(null)
  const pendingDrawAnimationFrameIdRef = useRef<number | null>(null)
  const pendingDrawTimeoutIdsRef = useRef<number[]>([])
  const pendingMulliganDrawReplayRef = useRef(false)
  const previousHandZoneSnapshotRef = useRef<IHandZoneSnapshot>({
    topHandInstanceIds: new Set<string>(),
    bottomHandInstanceIds: new Set<string>(),
    topDeckCount: 0,
    bottomDeckCount: 0,
    topTrashCount: 0,
    bottomTrashCount: 0,
    isInitialized: false,
  })
  const [bottomHandFaceUpByInstanceId, setBottomHandFaceUpByInstanceId] = useState<Record<string, boolean>>({})
  const [isMulliganAnimationPending, setIsMulliganAnimationPending] = useState(false)
  const toggleTheme = useThemeStore((state) => state.toggleTheme)
  const authUserId = useAuthSessionStore((state) => state.session?.userId)
  
  const { joinCode, gameCards, gameState: initialGameState } = useLoaderData() as IGameLoaderData
  const {
    gameState,
    isConnected,
    isActionPending,
    connectionError,
    actionError,
    submitHubIntent,
  } = useGameHubState(joinCode, initialGameState, authUserId)

  const players = gameState.players

  const derivedGameState = useDerivedGameViewState(gameCards, players, authUserId)
  const { topLeaderCard, bottomLeaderCard } = derivedGameState
  const topHandCards = derivedGameState.opponentPlayer?.hand ?? []
  const bottomHandCards = derivedGameState.currentPlayer?.hand ?? []
  const topDeckCount = derivedGameState.opponentPlayer?.deckCount ?? 0
  const bottomDeckCount = derivedGameState.currentPlayer?.deckCount ?? 0
  const topTrashCount = derivedGameState.opponentPlayer?.trash.length ?? 0
  const bottomTrashCount = derivedGameState.currentPlayer?.trash.length ?? 0

  const topLeaderCardFrameClassName = buildLeaderCardFrameClass(LEADER_CARD_FRAME_CLASS, Boolean(topLeaderCard))
  const bottomLeaderCardFrameClassName = buildLeaderCardFrameClass(LEADER_CARD_FRAME_CLASS, Boolean(bottomLeaderCard))

  useCardCatalogPreload(gameCards)

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return
    }

    console.log('[GameView] Received gameState update', gameState)
  }, [gameState])

  const canResolvePrompt = gameState.pendingPrompt?.isAwaitingRequestingPlayer ?? false
  const promptPresentation = toPromptPresentation(gameState.pendingPrompt)
  const shouldShowPromptOverlay =
    promptPresentation?.renderAsOverlay === true && promptPresentation.isAwaitingRequestingPlayer

  useEffect(() => {
    hasPendingPromptRef.current = Boolean(gameState.pendingPrompt)
  }, [gameState.pendingPrompt])

  useEffect(() => {
    isActionPendingRef.current = isActionPending
  }, [isActionPending])

  useEffect(() => {
    const previousSnapshot = previousHandZoneSnapshotRef.current
    const nextTopHandInstanceIds = topHandCards.map((card) => card.instanceId)
    const nextBottomHandInstanceIds = bottomHandCards.map((card) => card.instanceId)
    const nextTopHandInstanceIdSet = new Set(nextTopHandInstanceIds)
    const nextBottomHandInstanceIdSet = new Set(nextBottomHandInstanceIds)

    if (previousSnapshot.isInitialized) {
      const newTopHandCards = nextTopHandInstanceIds.filter((instanceId) => !previousSnapshot.topHandInstanceIds.has(instanceId))
      const newBottomHandCards = nextBottomHandInstanceIds.filter((instanceId) => !previousSnapshot.bottomHandInstanceIds.has(instanceId))
      const removedTopHandCards = [...previousSnapshot.topHandInstanceIds].filter((instanceId) => !nextTopHandInstanceIdSet.has(instanceId))
      const removedBottomHandCards = [...previousSnapshot.bottomHandInstanceIds].filter((instanceId) => !nextBottomHandInstanceIdSet.has(instanceId))
      const topDeckDecrease = Math.max(previousSnapshot.topDeckCount - topDeckCount, 0)
      const bottomDeckDecrease = Math.max(previousSnapshot.bottomDeckCount - bottomDeckCount, 0)
      const topTrashIncrease = Math.max(topTrashCount - previousSnapshot.topTrashCount, 0)
      const bottomTrashIncrease = Math.max(bottomTrashCount - previousSnapshot.bottomTrashCount, 0)
      const topDeckToHandCards = newTopHandCards.slice(0, topDeckDecrease)
      const bottomDeckToHandCards = pendingMulliganDrawReplayRef.current
        ? nextBottomHandInstanceIds
        : newBottomHandCards.slice(0, bottomDeckDecrease)
      const topHandToTrashCards = removedTopHandCards.slice(0, topTrashIncrease)
      const bottomHandToTrashCards = removedBottomHandCards.slice(0, bottomTrashIncrease)

      if (pendingMulliganDrawReplayRef.current) {
        pendingMulliganDrawReplayRef.current = false
      }

      if (topHandToTrashCards.length > 0 || bottomHandToTrashCards.length > 0) {
        pendingDrawAnimationFrameIdRef.current = window.requestAnimationFrame(() => {
          topHandToTrashCards.forEach((instanceId, index) => {
            const movementDelay = index * HAND_TO_PILE_STAGGER_MS
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
            pendingDrawTimeoutIdsRef.current.push(timeoutId)
          })

          bottomHandToTrashCards.forEach((instanceId, index) => {
            const movementDelay = index * HAND_TO_PILE_STAGGER_MS
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
            pendingDrawTimeoutIdsRef.current.push(timeoutId)
          })
        })
      }

      if (bottomDeckToHandCards.length > 0) {
        setBottomHandFaceUpByInstanceId((previousState) => {
          const nextState: Record<string, boolean> = {}

          for (const instanceId of nextBottomHandInstanceIds) {
            nextState[instanceId] = previousState[instanceId] ?? true
          }

          for (const instanceId of bottomDeckToHandCards) {
            nextState[instanceId] = false
          }

          return nextState
        })
      }

      if (topDeckToHandCards.length > 0 || bottomDeckToHandCards.length > 0) {
        pendingDrawAnimationFrameIdRef.current = window.requestAnimationFrame(() => {
          topDeckToHandCards.forEach((instanceId, index) => {
            const movementDelay = index * DRAW_TO_HAND_STAGGER_MS
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
            pendingDrawTimeoutIdsRef.current.push(timeoutId)
          })

          bottomDeckToHandCards.forEach((instanceId, index) => {
            const movementDelay = index * DRAW_TO_HAND_STAGGER_MS
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
            }, movementDelay + DRAW_TO_HAND_REVEAL_DELAY_MS)
            pendingDrawTimeoutIdsRef.current.push(movementTimeoutId, revealTimeoutId)
          })
        })
      }
    }

    setBottomHandFaceUpByInstanceId((previousState) => {
      const nextState: Record<string, boolean> = {}
      for (const instanceId of nextBottomHandInstanceIds) {
        nextState[instanceId] = previousState[instanceId] ?? true
      }

      return nextState
    })

    previousHandZoneSnapshotRef.current = {
      topHandInstanceIds: new Set(nextTopHandInstanceIds),
      bottomHandInstanceIds: new Set(nextBottomHandInstanceIds),
      topDeckCount,
      bottomDeckCount,
      topTrashCount,
      bottomTrashCount,
      isInitialized: true,
    }
  }, [
    bottomDeckCount,
    bottomHandCards,
    bottomTrashCount,
    DRAW_TO_HAND_REVEAL_DELAY_MS,
    DRAW_TO_HAND_STAGGER_MS,
    HAND_TO_PILE_STAGGER_MS,
    topDeckCount,
    topHandCards,
    topTrashCount,
  ])

  useEffect(() => {
    return () => {
      if (pendingDrawAnimationFrameIdRef.current !== null) {
        window.cancelAnimationFrame(pendingDrawAnimationFrameIdRef.current)
      }

      pendingDrawTimeoutIdsRef.current.forEach((timeoutId) => {
        window.clearTimeout(timeoutId)
      })
      pendingDrawTimeoutIdsRef.current = []
    }
  }, [])

  useEffect(() => {
    if (!isConnected || isActionPending || gameState.pendingPrompt) {
      return
    }

    const hasEnabledAdvancePhaseAction = gameState.availableActions.some(
      (action) => action.actionId === 'advance-phase' && action.isEnabled,
    )
    if (!hasEnabledAdvancePhaseAction) {
      return
    }

    if (!AUTO_SIGNAL_PHASES.has(gameState.phase)) {
      return
    }

    const phaseSnapshotKey = `${gameState.turnNumber}:${gameState.phase}:${gameState.activePlayerId}`
    if (lastAutoSignalKeyRef.current === phaseSnapshotKey) {
      return
    }

    lastAutoSignalKeyRef.current = phaseSnapshotKey

    const timerId = window.setTimeout(() => {
      if (hasPendingPromptRef.current || isActionPendingRef.current) {
        return
      }

      void submitHubIntent({ intent: 'advance-phase' })
    }, 0)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [gameState.activePlayerId, gameState.availableActions, gameState.pendingPrompt, gameState.phase, gameState.turnNumber, isActionPending, isConnected, submitHubIntent])

  const mappedAvailableActions = shouldShowPromptOverlay
    ? gameState.availableActions.filter((action) => !action.actionId.startsWith('resolve-prompt:'))
    : gameState.availableActions

  function submitMappedAction(action: IGameActionOptionResponse): void {
    const intentRequest = mapActionToHubIntent(action, canResolvePrompt)
    if (!intentRequest) {
      return
    }

    void submitHubIntent(intentRequest)
  }

  async function handlePromptResolve(selectedOption: string): Promise<void> {
    const isMulliganResolve = promptPresentation?.promptType === 'Mulligan' && selectedOption === 'mulligan'

    if (!isMulliganResolve) {
      await submitHubIntent({
        intent: 'resolve-prompt',
        selectedOption,
      })
      return
    }

    setIsMulliganAnimationPending(true)

    const currentBottomHandInstanceIds = bottomHandCards.map((card) => card.instanceId)
    currentBottomHandInstanceIds.forEach((instanceId, index) => {
      const animationTimeoutId = window.setTimeout(() => {
        runHandToPileAnimation({
          side: 'bottom',
          destination: 'deck',
          cardInstanceId: instanceId,
          topDeckCardRef,
          bottomDeckCardRef,
          topTrashCardRef,
          bottomTrashCardRef,
          topHandRowRef,
          bottomHandRowRef,
        })
      }, index * HAND_TO_PILE_STAGGER_MS)

      pendingDrawTimeoutIdsRef.current.push(animationTimeoutId)
    })

    const totalHandToPileMs =
      currentBottomHandInstanceIds.length > 0
        ? (currentBottomHandInstanceIds.length - 1) * HAND_TO_PILE_STAGGER_MS + HAND_TO_PILE_DURATION_MS
        : 0

    pendingMulliganDrawReplayRef.current = true

    await waitMillis(totalHandToPileMs)

    await submitHubIntent({
      intent: 'resolve-prompt',
      selectedOption,
    })

    setIsMulliganAnimationPending(false)
  }

  return (
    <PageShell compact>
      <div
        ref={outerZoneRef}
        className={`mx-auto grid h-full min-h-0 w-full overflow-hidden gap-1.5 rounded-2xl turn-zone-split-outer ${GAMEBOARD_MAX_WIDTH_CLASS} ${GAMEBOARD_COLUMNS_CLASS}`}
      >
        <Panel className="col-span-full h-full min-h-0 overflow-hidden bg-transparent py-2.5 px-1.5">
          <div className="grid h-full min-h-0 grid-rows-[1fr_4fr_auto_1fr] gap-1.5 rounded-2xl p-1">
            <div className="grid min-h-0 grid-cols-[1fr_1.5rem] gap-1">
              <PlayRow className="rounded-2xl border border-dashed border-[var(--border-subtle)] p-1.5 turn-band-blue">
                <div ref={topHandRowRef} className="flex h-full min-h-0 flex-wrap items-start gap-1.5 overflow-hidden">
                  {topHandCards.map((card) => (
                    <div
                      key={`top-hand-${card.instanceId}`}
                      data-hand-instance-id={card.instanceId}
                      className="h-full max-h-[64px] aspect-[200/277] shrink-0"
                    >
                      <CardBack className="h-full w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)]" />
                    </div>
                  ))}
                </div>
              </PlayRow>
            </div>

            <div className="grid min-h-0 grid-cols-[1fr_1.5rem] gap-1">
              <div ref={boardZoneRef} className="grid min-h-0 overflow-hidden grid-rows-[1fr_1fr_auto_1fr_1fr] gap-1.5 rounded-2xl border border-dashed border-[var(--border-subtle)] p-2 turn-zone-split">
                <div className="row-span-2 grid min-h-0 grid-cols-[auto_minmax(0,1fr)_auto] gap-1.5 rounded-xl p-1">
                  <div className="grid min-h-0 grid-rows-[1fr_1fr] gap-1">
                    <PlayPileZone
                      side="top"
                      labels={['Deck', 'Trash']}
                      cardBackTone="blue"
                      gameState={derivedGameState}
                      deckCardRef={topDeckCardRef}
                      trashCardRef={topTrashCardRef}
                    />
                    <PlayResourceTracker cardClassName="turn-band-blue" reverse />
                  </div>

                  <div className="grid min-h-0 grid-rows-[1fr_1fr] gap-1">
                    <SupportCardZone />
                    <div className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)]" />
                  </div>

                  <div className="min-h-0">
                    <LeaderCard
                      className={topLeaderCardFrameClassName}
                      imageClassName={LEADER_CARD_IMAGE_CLASS}
                      leaderCard={topLeaderCard}
                      showBadgeWhenLifeMissing
                    />
                  </div>
                </div>

                <GamePhaseIndicator gameInstance={gameState} authUserId={authUserId} />

                <div className="row-span-2 grid min-h-0 grid-cols-[auto_minmax(0,1fr)_auto] gap-1.5 rounded-xl p-1">
                  <div className="min-h-0">
                    <LeaderCard
                      className={bottomLeaderCardFrameClassName}
                      imageClassName={LEADER_CARD_IMAGE_CLASS}
                      leaderCard={bottomLeaderCard}
                    />
                  </div>

                  <div className="grid min-h-0 grid-rows-[1fr_1fr] gap-1">
                    <div className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)]" />
                    <SupportCardZone />
                  </div>

                  <div className="grid min-h-0 grid-rows-[1fr_1fr] gap-1">
                    <PlayResourceTracker cardClassName="turn-band-orange-button" />
                    <PlayPileZone
                      side="bottom"
                      labels={['Trash', 'Deck']}
                      cardBackTone="orange"
                      gameState={derivedGameState}
                      deckCardRef={bottomDeckCardRef}
                      trashCardRef={bottomTrashCardRef}
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end justify-center gap-1">
                {joinCode ? (
                  <div className="mb-1 px-0.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)] opacity-[0.45] [writing-mode:vertical-rl] rotate-180">
                    {joinCode}
                  </div>
                ) : null}

                <div className="group relative">
                  <AppButton
                    type="button"
                    variant="ghost"
                    onClick={toggleTheme}
                    aria-label="Toggle light and dark mode"
                    className="h-5 w-5 min-w-0 rounded-md bg-[var(--surface-muted)] px-0 py-0 text-[var(--text-primary)]"
                  >
                    <Lightbulb size={10} />
                  </AppButton>
                  <span className="pointer-events-none absolute right-full top-1/2 mr-1.5 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--text-primary)] shadow-sm group-hover:block">
                    Toggle Theme
                  </span>
                </div>

                <div className="group relative">
                  <AppButton
                    type="button"
                    variant="ghost"
                    aria-label="Pass turn"
                    onClick={() => {
                      void submitHubIntent({ intent: 'pass-turn' })
                    }}
                    disabled={!isConnected || isActionPending}
                    className="h-5 w-5 min-w-0 rounded-md bg-[var(--surface-muted)] px-0 py-0 text-[var(--text-primary)]"
                  >
                    <SkipForward size={10} />
                  </AppButton>
                  <span className="pointer-events-none absolute right-full top-1/2 mr-1.5 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--text-primary)] shadow-sm group-hover:block">
                    Pass Turn
                  </span>
                </div>
                
                <div className="group relative">
                  <AppButton
                    type="button"
                    variant="ghost"
                    aria-label="Undo action"
                    disabled={!isConnected || isActionPending}
                    className="h-5 w-5 min-w-0 rounded-md bg-[var(--surface-muted)] px-0 py-0 text-[var(--text-primary)]"
                  >
                    <RotateCcw size={10} />
                  </AppButton>
                  <span className="pointer-events-none absolute right-full top-1/2 mr-1.5 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--text-primary)] shadow-sm group-hover:block">
                    Undo Action
                  </span>
                </div>

                <div className="group relative">
                  <AppButton
                    type="button"
                    variant="ghost"
                    aria-label="Open log"
                    disabled={!isConnected || isActionPending}
                    className="h-5 w-5 min-w-0 rounded-md bg-[var(--surface-muted)] px-0 py-0 text-[var(--text-primary)]"
                  >
                    <ScrollText size={10} />
                  </AppButton>
                  <span className="pointer-events-none absolute right-full top-1/2 mr-1.5 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--text-primary)] shadow-sm group-hover:block">
                    Open Log
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-[1fr_1.5rem] gap-1">
              <div className="flex flex-col justify-start gap-1 rounded-xl p-1">
                {connectionError ? (
                  <span className="text-[10px] font-semibold text-[var(--text-danger)]">{connectionError}</span>
                ) : null}
                {actionError ? (
                  <span className="text-[10px] font-semibold text-[var(--text-danger)]">{actionError}</span>
                ) : null}
                <div className="flex h-6 flex-wrap items-center justify-start gap-1.5">
                  {mappedAvailableActions.map((action) => {
                    return (
                      <AppButton
                        key={action.actionId}
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          submitMappedAction(action)
                        }}
                        disabled={!isConnected || isActionPending || !action.isEnabled}
                        title={action.disabledReason ?? undefined}
                        className="h-6 min-w-0 px-1.5 text-[10px] turn-band-orange-button"
                      >
                        {action.label}
                      </AppButton>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="grid min-h-0 grid-cols-[1fr_1.5rem] gap-1">
              <PlayRow className="overflow-hidden rounded-2xl border border-dashed border-[var(--border-subtle)] p-1.5 turn-band-orange">
                <div ref={bottomHandRowRef} className="flex h-full min-h-0 flex-wrap items-start gap-1.5 overflow-hidden">
                  {bottomHandCards.map((card) => (
                    <div
                      key={`bottom-hand-${card.instanceId}`}
                      data-hand-instance-id={card.instanceId}
                      className="h-full max-h-[64px] aspect-[200/277] shrink-0"
                    >
                      <FlippableCard
                        isFlipped={bottomHandFaceUpByInstanceId[card.instanceId] ?? true}
                        durationMs={340}
                        front={
                          <CardImage
                            src={derivedGameState.cardById.get(card.cardDefinitionId.trim().toLowerCase())?.image ?? null}
                            alt={derivedGameState.cardById.get(card.cardDefinitionId.trim().toLowerCase())?.displayName ?? 'Hand card'}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] object-contain"
                          />
                        }
                        back={<CardBack className="h-full w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)]" />}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Your hand: {bottomHandCards.length}
                </div>
              </PlayRow>
            </div>
          </div>
        </Panel>

        <GamePromptOverlay
          isOpen={shouldShowPromptOverlay}
          prompt={promptPresentation}
          isConnected={isConnected}
          isActionPending={isActionPending || isMulliganAnimationPending}
          onResolve={(selectedOption) => {
            void handlePromptResolve(selectedOption)
          }}
        />

      </div>
    </PageShell>
  )
}

function runHandToPileAnimation({
  side,
  destination,
  cardInstanceId,
  topDeckCardRef,
  bottomDeckCardRef,
  topTrashCardRef,
  bottomTrashCardRef,
  topHandRowRef,
  bottomHandRowRef,
}: IHandToPileAnimationArgs): void {
  const sourceHandRowElement = side === 'top' ? topHandRowRef.current : bottomHandRowRef.current
  const destinationPileElement = destination === 'deck'
    ? side === 'top'
      ? topDeckCardRef.current
      : bottomDeckCardRef.current
    : side === 'top'
      ? topTrashCardRef.current
      : bottomTrashCardRef.current

  if (!sourceHandRowElement || !destinationPileElement) {
    return
  }

  const sourceCardElement = sourceHandRowElement.querySelector<HTMLDivElement>(
    `[data-hand-instance-id="${cardInstanceId}"]`,
  )
  if (!sourceCardElement) {
    return
  }

  const sourceRect = sourceCardElement.getBoundingClientRect()
  const destinationRect = destinationPileElement.getBoundingClientRect()

  if (sourceRect.width <= 0 || sourceRect.height <= 0 || destinationRect.width <= 0 || destinationRect.height <= 0) {
    return
  }

  const sourceCenterX = sourceRect.left + sourceRect.width / 2
  const sourceCenterY = sourceRect.top + sourceRect.height / 2
  const destinationCenterX = destinationRect.left + destinationRect.width / 2
  const destinationCenterY = destinationRect.top + destinationRect.height / 2
  const translateX = destinationCenterX - sourceCenterX
  const translateY = destinationCenterY - sourceCenterY

  const movingCardElement = sourceCardElement.cloneNode(true) as HTMLDivElement
  movingCardElement.style.position = 'fixed'
  movingCardElement.style.left = `${sourceCenterX}px`
  movingCardElement.style.top = `${sourceCenterY}px`
  movingCardElement.style.width = `${sourceRect.width}px`
  movingCardElement.style.height = `${sourceRect.height}px`
  movingCardElement.style.margin = '0'
  movingCardElement.style.pointerEvents = 'none'
  movingCardElement.style.zIndex = '220'
  movingCardElement.style.transform = 'translate(-50%, -50%)'
  movingCardElement.style.filter = 'drop-shadow(0 8px 18px rgba(0, 0, 0, 0.45))'

  document.body.appendChild(movingCardElement)

  const animation = movingCardElement.animate(
    [
      {
        transform: 'translate(-50%, -50%) translate(0px, 0px) scale(1)',
        opacity: 0.98,
      },
      {
        transform: `translate(-50%, -50%) translate(${translateX}px, ${translateY}px) scale(0.9)`,
        opacity: 0.92,
      },
    ],
    {
      duration: 340,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    },
  )

  animation.onfinish = () => {
    movingCardElement.remove()
  }

  animation.oncancel = () => {
    movingCardElement.remove()
  }
}

async function waitMillis(durationMs: number): Promise<void> {
  if (durationMs <= 0) {
    return
  }

  await new Promise<void>((resolve) => {
    window.setTimeout(() => {
      resolve()
    }, durationMs)
  })
}

function runDeckToHandAnimation({
  side,
  cardInstanceId,
  topDeckCardRef,
  bottomDeckCardRef,
  topHandRowRef,
  bottomHandRowRef,
}: IDeckToHandAnimationArgs): void {
  const sourceDeckElement = side === 'top' ? topDeckCardRef.current : bottomDeckCardRef.current
  const destinationHandRowElement = side === 'top' ? topHandRowRef.current : bottomHandRowRef.current

  if (!sourceDeckElement || !destinationHandRowElement) {
    return
  }

  const destinationCardElement = destinationHandRowElement.querySelector<HTMLDivElement>(
    `[data-hand-instance-id="${cardInstanceId}"]`,
  )
  const sourceRect = sourceDeckElement.getBoundingClientRect()
  const destinationRect = (destinationCardElement ?? destinationHandRowElement).getBoundingClientRect()

  if (sourceRect.width <= 0 || sourceRect.height <= 0 || destinationRect.width <= 0 || destinationRect.height <= 0) {
    return
  }

  const sourceCenterX = sourceRect.left + sourceRect.width / 2
  const sourceCenterY = sourceRect.top + sourceRect.height / 2
  const destinationCenterX = destinationRect.left + destinationRect.width / 2
  const destinationCenterY = destinationRect.top + destinationRect.height / 2
  const translateX = destinationCenterX - sourceCenterX
  const translateY = destinationCenterY - sourceCenterY

  const movingCardElement = sourceDeckElement.cloneNode(true) as HTMLDivElement
  movingCardElement.style.position = 'fixed'
  movingCardElement.style.left = `${sourceCenterX}px`
  movingCardElement.style.top = `${sourceCenterY}px`
  movingCardElement.style.width = `${sourceRect.width}px`
  movingCardElement.style.height = `${sourceRect.height}px`
  movingCardElement.style.margin = '0'
  movingCardElement.style.pointerEvents = 'none'
  movingCardElement.style.zIndex = '220'
  movingCardElement.style.transform = 'translate(-50%, -50%)'
  movingCardElement.style.filter = 'drop-shadow(0 8px 18px rgba(0, 0, 0, 0.45))'

  document.body.appendChild(movingCardElement)

  const animation = movingCardElement.animate(
    [
      {
        transform: 'translate(-50%, -50%) translate(0px, 0px) scale(1)',
        opacity: 0.97,
      },
      {
        transform: `translate(-50%, -50%) translate(${translateX}px, ${translateY}px) scale(0.92)`,
        opacity: 0.99,
      },
    ],
    {
      duration: 420,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    },
  )

  animation.onfinish = () => {
    movingCardElement.remove()
  }

  animation.oncancel = () => {
    movingCardElement.remove()
  }
}
