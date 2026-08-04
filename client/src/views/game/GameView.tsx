import { Lightbulb, RotateCcw, ScrollText, SkipForward } from 'lucide-react'
import { PageShell } from '../../components/layout/PageShell'
import { Panel } from '../../components/ui/Panel'
import { AppButton } from '../../components/ui/AppButton'
import { useThemeStore } from '../../state/themeStore'
import { useAlignedSplit } from './useAlignedSplit'

export function GameView() {
  const toggleTheme = useThemeStore((state) => state.toggleTheme)
  const isPlayerTurn = true
  const { outerRef: outerZoneRef, innerRef: boardZoneRef } = useAlignedSplit()

  return (
    <PageShell compact>
      <div ref={outerZoneRef} className="grid h-full min-h-0 overflow-hidden gap-1.5 rounded-2xl turn-zone-split-outer lg:grid-cols-[1.1fr_1.9fr_1.1fr]">
        <Panel className="col-span-full h-full min-h-0 overflow-hidden bg-transparent py-2.5 px-1.5">
          <div className="grid h-full min-h-0 grid-rows-[1fr_4fr_auto_1fr] gap-1.5 rounded-2xl p-1">
            <div className="grid min-h-0 grid-cols-[1fr_1.5rem] gap-1">
              
              <div className="min-h-0 rounded-2xl border border-dashed border-[var(--border-subtle)] p-1.5 turn-band-blue">
                <div className="flex h-full flex-wrap items-start gap-2" /> 
              </div>
            </div>

            <div className="grid min-h-0 grid-cols-[1fr_1.5rem] gap-1">
              <div ref={boardZoneRef} className="grid min-h-0 overflow-hidden grid-rows-[1fr_1fr_auto_1fr_1fr] gap-1.5 rounded-2xl border border-dashed border-[var(--border-subtle)] p-2 turn-zone-split">
                <div className="row-span-2 grid min-h-0 grid-rows-[1fr_1fr] gap-1 rounded-xl p-1">
                  <div className="grid min-h-0 overflow-visible grid-cols-6 gap-1.5">
                    <div className="flex h-full items-stretch justify-start gap-0">
                      <div className="h-full mx-1 w-auto max-w-full aspect-[200/277] object-cover flex items-center justify-center text-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[10px]" >
                        Deck
                      </div>
                      <div className="h-full w-auto max-w-full aspect-[200/277] object-cover flex items-center justify-center text-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[10px]" >
                        Trash
                      </div>
                    </div>
                    <div className="col-start-2 col-span-4 grid min-h-0 overflow-hidden grid-cols-5 justify-items-center gap-1.5">
                      <div className="h-full w-auto max-w-full aspect-[200/277] object-cover rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)]" />
                      <div className="h-full w-auto max-w-full aspect-[200/277] object-cover rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)]" />
                      <div className="h-full w-auto max-w-full aspect-[200/277] object-cover rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)]" />
                      <div className="h-full w-auto max-w-full aspect-[200/277] object-cover rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)]" />
                      <div className="h-full w-auto max-w-full aspect-[200/277] object-cover rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)]" />
                    </div>
                    <div className="relative h-full">
                      <div className="absolute right-0 top-0 z-10 h-[calc(200%+0.375rem)] w-auto aspect-[200/277] object-cover flex items-center justify-center text-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[10px]" >
                        Leader
                      </div>
                    </div>
                  </div>

                  <div className="grid min-h-0 overflow-hidden grid-cols-6 gap-1.5">
                    <div className="grid min-h-0 grid-rows-[1fr_1fr_1fr] gap-px rounded-lg border border-dashed border-[var(--border-subtle)] p-px bg-[var(--surface-elevated)]">
                      <div className="flex min-h-0 items-center justify-center gap-0.5">
                        <div className="h-full max-h-full w-auto max-w-full aspect-[200/277] rounded-sm border border-[var(--border-subtle)] turn-band-blue" />
                        <div className="h-full max-h-full w-auto max-w-full aspect-[200/277] rounded-sm border border-[var(--border-subtle)] turn-band-blue" />
                        <div className="h-full max-h-full w-auto max-w-full aspect-[200/277] rounded-sm border border-[var(--border-subtle)] turn-band-blue" />
                      </div>
                      <div className="flex min-h-0 items-center justify-center gap-0.5">
                        <div className="h-full max-h-full w-auto max-w-full aspect-[200/277] rounded-sm border border-[var(--border-subtle)] turn-band-blue" />
                        <div className="h-full max-h-full w-auto max-w-full aspect-[200/277] rounded-sm border border-[var(--border-subtle)] turn-band-blue" />
                        <div className="h-full max-h-full w-auto max-w-full aspect-[200/277] rounded-sm border border-[var(--border-subtle)] turn-band-blue" />
                      </div>
                      <div className="grid min-h-0 place-items-center">
                        <div className="h-full max-h-full w-auto max-w-full aspect-[200/277] rounded-sm border border-[var(--border-subtle)] turn-band-blue" />
                      </div>
                    </div>
                    <div className="col-span-4 rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)]" />
                    <div className="rounded-lg border border-transparent bg-transparent" />
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

                <div className="row-span-2 grid min-h-0 grid-rows-[1fr_1fr] gap-1 rounded-xl p-1">
                  <div className="grid min-h-0 overflow-visible grid-cols-6 gap-1.5">
                    <div className="relative h-full">
                      <div className="absolute top-0 left-0 z-10 h-[calc(200%+0.375rem)] w-auto aspect-[200/277] object-cover flex items-center justify-center text-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[10px]" >
                        Leader
                      </div>
                    </div>
                    <div className="col-span-4 rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)]" ></div>
                    <div className="grid min-h-0 grid-rows-[1fr_1fr_1fr] gap-px rounded-lg border border-dashed border-[var(--border-subtle)] p-px bg-[var(--surface-elevated)]">
                      <div className="flex min-h-0 items-center justify-center gap-0.5">
                        <div className="h-full max-h-full w-auto max-w-full aspect-[200/277] rounded-sm border border-[var(--border-subtle)] turn-band-orange-button" />
                        <div className="h-full max-h-full w-auto max-w-full aspect-[200/277] rounded-sm border border-[var(--border-subtle)] turn-band-orange-button" />
                        <div className="h-full max-h-full w-auto max-w-full aspect-[200/277] rounded-sm border border-[var(--border-subtle)] turn-band-orange-button" />
                      </div>
                      <div className="flex min-h-0 items-center justify-center gap-0.5">
                        <div className="h-full max-h-full w-auto max-w-full aspect-[200/277] rounded-sm border border-[var(--border-subtle)] turn-band-orange-button" />
                        <div className="h-full max-h-full w-auto max-w-full aspect-[200/277] rounded-sm border border-[var(--border-subtle)] turn-band-orange-button" />
                        <div className="h-full max-h-full w-auto max-w-full aspect-[200/277] rounded-sm border border-[var(--border-subtle)] turn-band-orange-button" />
                      </div>
                      <div className="grid min-h-0 place-items-center">
                        <div className="h-full max-h-full w-auto max-w-full aspect-[200/277] rounded-sm border border-[var(--border-subtle)] turn-band-orange-button" />
                      </div>
                    </div>
                  </div>

                  <div className="grid min-h-0 overflow-hidden grid-cols-6 gap-1.5">
                    <div className="rounded-lg border border-transparent bg-transparent" />
                    <div className="col-start-2 col-span-4 grid min-h-0 overflow-hidden grid-cols-5 justify-items-center gap-1.5">
                      <div className="h-full w-auto max-w-full aspect-[200/277] object-cover rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)]" />
                      <div className="h-full w-auto max-w-full aspect-[200/277] object-cover rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)]" />
                      <div className="h-full w-auto max-w-full aspect-[200/277] object-cover rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)]" />
                      <div className="h-full w-auto max-w-full aspect-[200/277] object-cover rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)]" />
                      <div className="h-full w-auto max-w-full aspect-[200/277] object-cover rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)]" />
                    </div>
                    <div className="flex h-full items-stretch justify-end gap-0">
                      <div className="h-full mx-1 w-auto max-w-full aspect-[200/277] object-cover flex items-center justify-center text-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[10px]" >
                        Trash
                      </div>
                      <div className="h-full w-auto max-w-full aspect-[200/277] object-cover flex items-center justify-center text-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[10px]" >
                        Deck
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end justify-center gap-1">
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
                <AppButton
                  type="button"
                  variant="ghost"
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
                  className="h-6 min-w-0 px-1.5 text-[10px] turn-band-orange-button"
                >
                  End Turn
                </AppButton>
              </div>
            </div>

            <div className="grid min-h-0 grid-cols-[1fr_1.5rem] gap-1">
              <div className="min-h-0 overflow-hidden rounded-2xl border border-dashed border-[var(--border-subtle)] p-1.5 turn-band-orange">
                <div className="flex h-full min-h-0 flex-wrap items-start gap-2" />
              </div>
            </div>
          </div>
        </Panel>

      </div>
    </PageShell>
  )
}
