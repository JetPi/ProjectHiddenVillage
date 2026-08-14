import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLoaderData } from 'react-router-dom'
import { useAutoAnimate } from '@formkit/auto-animate/react'
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
import { buildLeaderCardFrameClass, mapActionToHubIntent, runHandToPileAnimation, waitMillis } from './utils/functions'
import { toPromptPresentation } from './utils/promptPresentation'
import type { IGameLoaderData } from './types/routeData'
import type { IGameActionOptionResponse } from '../../services/api/types/game'
import type { IGameViewAnimController } from './types/hooks'
import { useCardCatalogPreload, useHandZoneAnimationEffects } from './hooks/useGameViewEffects'
import { useDerivedGameViewState } from './hooks/useDerivedGameViewState'
import { useGameHubState } from './hooks/useGameHubState'
import { GamePromptOverlay } from './components/GamePromptOverlay'
import { GamePhaseIndicator } from './components/GamePhaseIndicator'
import {
  GAMEBOARD_MAX_WIDTH_CLASS,
  GAMEBOARD_COLUMNS_CLASS,
  LEADER_CARD_FRAME_CLASS,
  LEADER_CARD_IMAGE_CLASS,
  DRAW_TO_HAND_STAGGER_MS,
  DRAW_TO_HAND_REVEAL_DELAY_MS,
  HAND_TO_PILE_STAGGER_MS,
  HAND_TO_PILE_DURATION_MS,
} from './utils/contants'


export function GameView() {
  const AUTO_SIGNAL_PHASES = useMemo(() => new Set([
    'DrawInitialHand',
    'RefreshPhase',
    'StartOfMainPhase',
    'DrawPhase',
    'AttackDeclaration',
    'AttackResolution',
    'BattleEndStep',
  ]), [])

  const { outerRef: outerZoneRef, innerRef: boardZoneRef } = useAlignedSplit()
  const topDeckCardRef = useRef<HTMLDivElement | null>(null)
  const bottomDeckCardRef = useRef<HTMLDivElement | null>(null)
  const topTrashCardRef = useRef<HTMLDivElement | null>(null)
  const bottomTrashCardRef = useRef<HTMLDivElement | null>(null)
  const topHandRowRef = useRef<HTMLDivElement | null>(null)
  const bottomHandRowRef = useRef<HTMLDivElement | null>(null)
  const [topHandAutoAnimateRef] = useAutoAnimate({ duration: 220, easing: 'ease-out' })
  const [bottomHandAutoAnimateRef] = useAutoAnimate({ duration: 220, easing: 'ease-out' })
  const animControllerRef = useRef<IGameViewAnimController>({
    lastAutoSignalKey: '',
    pendingDrawAnimationFrameId: null,
    pendingDrawTimeoutIds: [],
    pendingMulliganDrawReplay: false,
    previousHandZoneSnapshot: {
      topHandInstanceIds: new Set<string>(),
      bottomHandInstanceIds: new Set<string>(),
      topDeckCount: 0,
      bottomDeckCount: 0,
      topTrashCount: 0,
      bottomTrashCount: 0,
      isInitialized: false,
    },
  })
  const [bottomHandFaceUpByInstanceId, setBottomHandFaceUpByInstanceId] = useState<Record<string, boolean>>({})
  const [isMulliganAnimationPending, setIsMulliganAnimationPending] = useState(false)
  const toggleTheme = useThemeStore((state) => state.toggleTheme)
  const authUserId = useAuthSessionStore((state) => state.session?.userId)

  const setTopHandRowRefs = useCallback((node: HTMLDivElement | null) => {
    topHandRowRef.current = node
    topHandAutoAnimateRef(node)
  }, [topHandAutoAnimateRef])

  const setBottomHandRowRefs = useCallback((node: HTMLDivElement | null) => {
    bottomHandRowRef.current = node
    bottomHandAutoAnimateRef(node)
  }, [bottomHandAutoAnimateRef])
  
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
  const topHandCards = useMemo(() => derivedGameState.opponentPlayer?.hand ?? [], [derivedGameState.opponentPlayer?.hand])
  const bottomHandCards = useMemo(() => derivedGameState.currentPlayer?.hand ?? [], [derivedGameState.currentPlayer?.hand])
  const topHandInstanceIds = useMemo(() => topHandCards.map((card) => card.instanceId), [topHandCards])
  const bottomHandInstanceIds = useMemo(() => bottomHandCards.map((card) => card.instanceId), [bottomHandCards])
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
  const hasPendingPromptFlag = Boolean(gameState.pendingPrompt)
  const isActionPendingFlag = isActionPending

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
    topDeckCardRef,
    bottomDeckCardRef,
    topTrashCardRef,
    bottomTrashCardRef,
    topHandRowRef,
    bottomHandRowRef,
    animControllerRef,
    setBottomHandFaceUpByInstanceId,
  })

  useEffect(() => {
    if (!isConnected || isActionPendingFlag || gameState.pendingPrompt) {
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
    animControllerRef,
    gameState.activePlayerId,
    gameState.availableActions,
    gameState.pendingPrompt,
    gameState.phase,
    gameState.turnNumber,
    hasPendingPromptFlag,
    isActionPendingFlag,
    isConnected,
    submitHubIntent,
    AUTO_SIGNAL_PHASES,
  ])

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

      animControllerRef.current.pendingDrawTimeoutIds.push(animationTimeoutId)
    })

    const totalHandToPileMs =
      currentBottomHandInstanceIds.length > 0
        ? (currentBottomHandInstanceIds.length - 1) * HAND_TO_PILE_STAGGER_MS + HAND_TO_PILE_DURATION_MS
        : 0

    animControllerRef.current.pendingMulliganDrawReplay = true

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
                <div ref={setTopHandRowRefs} className="flex h-full min-h-0 flex-wrap items-start gap-1.5 overflow-hidden">
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
                <div ref={setBottomHandRowRefs} className="flex h-full min-h-0 flex-wrap items-start gap-1.5 overflow-hidden">
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

