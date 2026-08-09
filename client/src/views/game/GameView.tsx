import { useActionData, useLoaderData, useRevalidator } from 'react-router-dom'
import { Lightbulb, RotateCcw, ScrollText, SkipForward } from 'lucide-react'
import { CardImage } from '../../components/ui/CardImage'
import { PageShell } from '../../components/layout/PageShell'
import { Panel } from '../../components/ui/Panel'
import { AppButton } from '../../components/ui/AppButton'
import { PlayCard } from '../../components/ui/PlayCard'
import { PlayPileZone } from '../../components/ui/PlayPileZone'
import { PlayResourceTracker } from '../../components/ui/PlayResourceTracker'
import { PlayRow } from '../../components/ui/PlayRow'
import { SupportCardZone } from '../../components/ui/SupportCardZone'
import { CardOverlayBadge } from '../../components/ui/CardOverlayBadge'
import { useAuthSessionStore } from '../../state/authSession'
import { useThemeStore } from '../../state/themeStore'
import { useAlignedSplit } from './useAlignedSplit'
import { buildLeaderCardFrameClass } from './utils/functions'
import type { IGameActionData, IGameLoaderData } from './types/routeData'
import { useCardCatalogPreload, useIdleRevalidationPoll } from './hooks/useGameViewEffects'
import { useGameIntentSubmit } from './hooks/useGameIntentSubmit'
import { useDerivedGameViewState } from './hooks/useDerivedGameViewState'
import {
  GAME_CARD_PRELOAD_POLL_INTERVAL_MS,
  GAMEBOARD_MAX_WIDTH_CLASS,
  GAMEBOARD_COLUMNS_CLASS,
  LEADER_CARD_FRAME_CLASS,
  LEADER_CARD_IMAGE_CLASS,
} from './utils/contants'

export function GameView() {
  const { outerRef: outerZoneRef, innerRef: boardZoneRef } = useAlignedSplit()
  const toggleTheme = useThemeStore((state) => state.toggleTheme)
  const authUserId = useAuthSessionStore((state) => state.session?.userId)
  
  const { joinCode, gameCards, gameInstance } = useLoaderData() as IGameLoaderData
  const actionData = useActionData() as IGameActionData | undefined
  const revalidator = useRevalidator()
  const submitGameIntent = useGameIntentSubmit()
  const isPlayerTurn = true
  
  const players = gameInstance.state.players

  const { topLeaderCard, bottomLeaderCard } = useDerivedGameViewState(gameCards, players, authUserId)

  const topLeaderCardFrameClassName = buildLeaderCardFrameClass(LEADER_CARD_FRAME_CLASS, Boolean(topLeaderCard))
  const bottomLeaderCardFrameClassName = buildLeaderCardFrameClass(LEADER_CARD_FRAME_CLASS, Boolean(bottomLeaderCard))

  useIdleRevalidationPoll(
    revalidator.state,
    revalidator.revalidate,
    GAME_CARD_PRELOAD_POLL_INTERVAL_MS,
  )
  useCardCatalogPreload(gameCards)

  console.log('GameView render', { topLeaderCard, bottomLeaderCard })

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
                    <PlayPileZone labels={['Deck', 'Trash', 'Exclusion']} cardBackTone="blue" />
                    <PlayResourceTracker cardClassName="turn-band-blue" reverse />
                  </div>

                  <div className="grid min-h-0 grid-rows-[1fr_1fr] gap-1">
                    <SupportCardZone />
                    <div className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)]" />
                  </div>

                  <div className="min-h-0">
                    <PlayCard className={topLeaderCardFrameClassName}>
                      {topLeaderCard ? (
                        <>
                            <CardOverlayBadge value={topLeaderCard.currentLife ?? 0} />
                         
                          <CardImage
                            src={topLeaderCard.image}
                            alt={topLeaderCard.displayName || topLeaderCard.id}
                            loading="eager"
                            className={LEADER_CARD_IMAGE_CLASS}
                          />
                        </>
                      ) : (
                        <div className="flex h-full items-center justify-center text-center">Leader</div>
                      )}
                    </PlayCard>
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
                    Your turn
                  </div>
                </div>

                <div className="row-span-2 grid min-h-0 grid-cols-[auto_minmax(0,1fr)_auto] gap-1.5 rounded-xl p-1">
                  <div className="min-h-0">
                    <PlayCard className={bottomLeaderCardFrameClassName}>
                      {bottomLeaderCard ? (
                        <>
                          {typeof bottomLeaderCard.currentLife === 'number' ? (
                            <CardOverlayBadge value={bottomLeaderCard.currentLife} />
                          ) : null}
                          <CardImage
                            src={bottomLeaderCard.image}
                            alt={bottomLeaderCard.displayName || bottomLeaderCard.id}
                            loading="eager"
                            className={LEADER_CARD_IMAGE_CLASS}
                          />
                        </>
                      ) : (
                        <div className="flex h-full items-center justify-center text-center">Leader</div>
                      )}
                    </PlayCard>
                  </div>

                  <div className="grid min-h-0 grid-rows-[1fr_1fr] gap-1">
                    <div className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)]" />
                    <SupportCardZone />
                  </div>

                  <div className="grid min-h-0 grid-rows-[1fr_1fr] gap-1">
                    <PlayResourceTracker cardClassName="turn-band-orange-button" />
                    <PlayPileZone labels={['Exclusion', 'Trash', 'Deck']} cardBackTone="orange" />
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
                    onClick={() => submitGameIntent('pass-turn')}
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
              <div className="flex flex-wrap items-center justify-start gap-1.5 rounded-xl p-1">
                {actionData?.gameAction && !actionData.gameAction.ok ? (
                  <span className="text-[10px] font-semibold text-[var(--text-danger)]">{actionData.gameAction.error}</span>
                ) : null}
                <AppButton
                  type="button"
                  variant="ghost"
                  onClick={() => submitGameIntent('declare-action')}
                  className="h-6 min-w-0 px-1.5 text-[10px] turn-band-orange-button"
                >
                  Attack
                </AppButton>
                <AppButton
                  type="button"
                  variant="ghost"
                  className="h-6 min-w-0 px-1.5 text-[10px] turn-band-orange-button"
                >
                  Defend
                </AppButton>
                <AppButton
                  type="button"
                  variant="ghost"
                  className="h-6 min-w-0 px-1.5 text-[10px] turn-band-orange-button"
                >
                  Summon
                </AppButton>
                <AppButton
                  type="button"
                  variant="ghost"
                  onClick={() => submitGameIntent('advance-phase')}
                  className="h-6 min-w-0 px-1.5 text-[10px] turn-band-orange-button"
                >
                  End Turn
                </AppButton>
              </div>
            </div>

            <div className="grid min-h-0 grid-cols-[1fr_1.5rem] gap-1">
              <PlayRow className="overflow-hidden rounded-2xl border border-dashed border-[var(--border-subtle)] p-1.5 turn-band-orange">
                <div className="flex h-full min-h-0 flex-wrap items-start gap-2" />
              </PlayRow>
            </div>
          </div>
        </Panel>

      </div>
    </PageShell>
  )
}
