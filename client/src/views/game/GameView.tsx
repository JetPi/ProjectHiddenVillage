import { useEffect, useRef } from 'react'
import { useLoaderData } from 'react-router-dom'
import { Lightbulb, RotateCcw, ScrollText, SkipForward } from 'lucide-react'
import { PageShell } from '../../components/layout/PageShell'
import { Panel } from '../../components/ui/Panel'
import { AppButton } from '../../components/ui/AppButton'
import { PlayPileZone } from '../../components/ui/PlayPileZone'
import { PlayResourceTracker } from '../../components/ui/PlayResourceTracker'
import { PlayRow } from '../../components/ui/PlayRow'
import { SupportCardZone } from '../../components/ui/SupportCardZone'
import { LeaderCard } from '../../components/ui/LeaderCard'
import { useAuthSessionStore } from '../../state/authSession'
import { useThemeStore } from '../../state/themeStore'
import { useAlignedSplit } from './useAlignedSplit'
import { buildLeaderCardFrameClass } from './utils/functions'
import { toPromptPresentation } from './utils/promptPresentation'
import type { IGameLoaderData } from './types/routeData'
import type { IGameActionOptionResponse } from '../../services/api/types/game'
import { useCardCatalogPreload } from './hooks/useGameViewEffects'
import { useDerivedGameViewState } from './hooks/useDerivedGameViewState'
import { useGameHubState } from './hooks/useGameHubState'
import { GamePromptOverlay } from './components/GamePromptOverlay'
import {
  GAMEBOARD_MAX_WIDTH_CLASS,
  GAMEBOARD_COLUMNS_CLASS,
  LEADER_CARD_FRAME_CLASS,
  LEADER_CARD_IMAGE_CLASS,
} from './utils/contants'

export function GameView() {
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
  const normalizedAuthUserId = (authUserId ?? '').trim().toLowerCase().replace(/-/g, '')
  const normalizedActivePlayerId = gameState.activePlayerId.trim().toLowerCase().replace(/-/g, '')
  const isPlayerTurn = normalizedAuthUserId.length > 0 && normalizedActivePlayerId === normalizedAuthUserId

  const derivedGameState = useDerivedGameViewState(gameCards, players, authUserId)
  const { topLeaderCard, bottomLeaderCard } = derivedGameState

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
    if (!isConnected || isActionPending || gameState.pendingPrompt) {
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
      void submitHubIntent({ intent: 'advance-phase' })
    }, 0)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [gameState.activePlayerId, gameState.pendingPrompt, gameState.phase, gameState.turnNumber, isActionPending, isConnected, submitHubIntent])

  const mappedAvailableActions = shouldShowPromptOverlay
    ? gameState.availableActions.filter((action) => !action.actionId.startsWith('resolve-prompt:'))
    : gameState.availableActions

  function submitMappedAction(action: IGameActionOptionResponse): void {
    if (action.actionId.startsWith('resolve-prompt:')) {
      if (!canResolvePrompt) {
        return
      }

      const selectedOption = action.actionId.slice('resolve-prompt:'.length)

      void submitHubIntent({
        intent: 'resolve-prompt',
        selectedOption,
      })
      return
    }

    if (action.actionId === 'declare-action') {
      void submitHubIntent({ intent: 'declare-action' })
      return
    }

    if (action.actionId === 'pass-turn') {
      void submitHubIntent({ intent: 'pass-turn' })
      return
    }

    if (action.actionId === 'advance-phase') {
      void submitHubIntent({ intent: 'advance-phase' })
      return
    }

    if (action.actionId === 'declare-end-step' || action.actionId === 'endPhase' || action.actionId === 'turn-end') {
      void submitHubIntent({ intent: 'declare-end-step' })
      return
    }

    if (action.actionId === 'declare-attack' || action.actionId === 'declareAttack') {
      void submitHubIntent({ intent: 'advance-phase' })
      return
    }

    if (action.actionId === 'complete-end-step') {
      void submitHubIntent({ intent: 'complete-end-step' })
      return
    }

    if (action.actionId === 'pass') {
      void submitHubIntent({ intent: 'pass-turn' })
    }
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
                <div className="flex h-full flex-wrap items-start gap-2" /> 
              </PlayRow>
            </div>

            <div className="grid min-h-0 grid-cols-[1fr_1.5rem] gap-1">
              <div ref={boardZoneRef} className="grid min-h-0 overflow-hidden grid-rows-[1fr_1fr_auto_1fr_1fr] gap-1.5 rounded-2xl border border-dashed border-[var(--border-subtle)] p-2 turn-zone-split">
                <div className="row-span-2 grid min-h-0 grid-cols-[auto_minmax(0,1fr)_auto] gap-1.5 rounded-xl p-1">
                  <div className="grid min-h-0 grid-rows-[1fr_1fr] gap-1">
                    <PlayPileZone side="top" labels={['Deck', 'Trash']} cardBackTone="blue" gameState={derivedGameState} />
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

                <div className="grid min-h-0 grid-cols-6">
                  <div
                    className={`text-[12px] col-span-6 rounded-md border border-[var(--border-subtle)] py-0.5 text-center font-extrabold leading-none ${
                      isPlayerTurn
                        ? 'turn-indicator-orange turn-indicator-text-light-theme'
                        : 'turn-indicator-blue turn-indicator-text-dark-theme'
                    }`}
                  >
                    {isPlayerTurn ? 'Your turn' : 'Opponent\'s turn'}
                  </div>
                </div>

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
                    <PlayPileZone side="bottom" labels={['Trash', 'Deck']} cardBackTone="orange" gameState={derivedGameState} />
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
                <div className="flex h-full min-h-0 flex-wrap items-start gap-2" />
              </PlayRow>
            </div>
          </div>
        </Panel>

        <GamePromptOverlay
          isOpen={shouldShowPromptOverlay}
          prompt={promptPresentation}
          isConnected={isConnected}
          isActionPending={isActionPending}
          onResolve={(selectedOption) => {
            void submitHubIntent({
              intent: 'resolve-prompt',
              selectedOption,
            })
          }}
        />

      </div>
    </PageShell>
  )
}
