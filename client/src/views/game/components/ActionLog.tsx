import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { twMerge } from 'tailwind-merge'
import { useGameUIStore } from '@/state/gameUIStore'
import type { IActionLogProps, IActionLogViewEntry } from '@/views/game/types'
import { useHasRoomForChatColumn } from '@/views/game/hooks'
import { buildActionLogView, formatActionLogEngineToken } from '@/views/game/utils/functions/helpers'
import {
  ACTION_LOG_COMPACT_BOTTOM_REM,
  ACTION_LOG_COMPACT_BOTTOM_WITH_CHAT_REM,
  ACTION_LOG_COMPACT_MIN_HEIGHT_REM,
  ACTION_LOG_COMPACT_TOP_REM,
  HUD_PANEL_WIDTH_CLASS,
} from '@/views/game/utils/contants'

const ACTOR_CHIP_CLASS: Record<IActionLogViewEntry['actor'], string> = {
  you: 'border-orange-300/70 bg-orange-400/20 text-orange-100',
  opponent: 'border-cyan-300/70 bg-cyan-400/20 text-cyan-100',
  system: 'border-white/25 bg-white/10 text-white/70',
}

const ACTOR_LABEL_KEYS = {
  you: 'game.actionLog.actorYou',
  opponent: 'game.actionLog.actorOpponent',
  system: 'game.actionLog.actorSystem',
} as const satisfies Record<IActionLogViewEntry['actor'], string>

const PINNED_TO_NEWEST_THRESHOLD_PX = 24

/**
 * The player-facing action log.
 *
 * It owns its own open/expanded state, the way the support-chain bubble owns its visibility: the board only renders it
 * and the sidebar only toggles the store flag, so nothing in the view has to know how the panel behaves.
 *
 * It sits under the support-chain band in its compact mode, so a long chain can never overlap it, and it covers the
 * board in its expanded mode, which the reader asks for from the panel itself. The board's log button only ever opens
 * and closes it: expanding is a decision about the panel, not about the game.
 */
function ActionLog({ gameState, authUserId, cardById, isConnected }: IActionLogProps) {
  const { t } = useTranslation()
  const isOpen = useGameUIStore((state) => state.isActionLogOpen)
  const isExpanded = useGameUIStore((state) => state.isActionLogExpanded)
  const setActionLogExpanded = useGameUIStore((state) => state.setActionLogExpanded)
  const isGameOverOverlayDismissed = useGameUIStore((state) => state.isGameOverOverlayDismissed)
  const hasRoomForChat = useHasRoomForChatColumn()

  const entries = useMemo(
    () => buildActionLogView(gameState, authUserId, cardById),
    [gameState, authUserId, cardById],
  )
  const panelRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLOListElement | null>(null)
  const isPinnedToNewestRef = useRef(true)

  const isPromptAwaiting = gameState.pendingPrompt?.isAwaitingRequestingPlayer === true
  // Both the prompt overlay and the result overlay sit *below* the expanded panel, so the panel would bury the one
  // control the reader has to click. Review mode is the exception: the reader dismissed the result overlay on purpose
  // to look at the finished board, so there is nothing left to bury and the log is theirs to expand.
  const isOutcomeOverlayShowing = Boolean(gameState.gameOutcome) && !isGameOverOverlayDismissed
  const mustStepAside = isPromptAwaiting || isOutcomeOverlayShowing
  const collapse = useCallback(() => setActionLogExpanded(false), [setActionLogExpanded])

  // The expanded panel must never be the reason a question is missed: an answerable prompt, or the result overlay
  // while it is still up, drops it back to the compact column where it can no longer cover anything clickable.
  useEffect(() => {
    if (isExpanded && mustStepAside) {
      collapse()
    }
  }, [isExpanded, mustStepAside, collapse])

  useEffect(() => {
    if (!isOpen || !isExpanded) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        collapse()
      }
    }

    // Capture-phase pointerdown so a click on the board collapses the panel even though the board's own handlers run
    // first and often stop propagation.
    const handlePointerDown = (event: PointerEvent) => {
      const panel = panelRef.current
      if (panel && event.target instanceof Node && panel.contains(event.target)) {
        return
      }

      collapse()
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('pointerdown', handlePointerDown, true)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [isOpen, isExpanded, collapse])

  // Follow the newest entry, but only while the reader is already at the bottom: scrolling back to reread the start
  // of a turn must not be undone by the next push.
  useEffect(() => {
    const list = listRef.current
    if (!isOpen || !list || !isPinnedToNewestRef.current) {
      return
    }

    list.scrollTop = list.scrollHeight
  }, [entries.length, isExpanded, isOpen])

  if (!isOpen) {
    return null
  }

  const handleScroll = () => {
    const list = listRef.current
    if (!list) {
      return
    }

    const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight
    isPinnedToNewestRef.current = distanceFromBottom <= PINNED_TO_NEWEST_THRESHOLD_PX
  }

  return (
    <>
      {isExpanded ? (
        <div aria-hidden="true" className="fixed inset-0 z-[270] bg-black/55" />
      ) : null}

      <div
        ref={panelRef}
        data-testid="action-log-panel"
        data-mode={isExpanded ? 'expanded' : 'compact'}
        style={
          isExpanded
            ? undefined
            : {
              top: `${ACTION_LOG_COMPACT_TOP_REM}rem`,
              // The docked chat strip owns the bottom of this corner, so the compact log stops above it.
              bottom: `${hasRoomForChat ? ACTION_LOG_COMPACT_BOTTOM_WITH_CHAT_REM : ACTION_LOG_COMPACT_BOTTOM_REM}rem`,
              minHeight: `${ACTION_LOG_COMPACT_MIN_HEIGHT_REM}rem`,
            }
        }
        className={twMerge(
          'flex flex-col overflow-hidden rounded-xl border border-cyan-300/45 bg-slate-950/92 text-[10px] leading-tight text-white shadow-[0_12px_30px_rgba(0,0,0,0.55)] backdrop-blur-sm',
          HUD_PANEL_WIDTH_CLASS,
          isExpanded
            ? 'fixed inset-y-2 right-2 z-[280] w-[min(28rem,46vw)] max-w-none'
            : 'fixed right-2 z-30',
        )}
      >
        <div className="flex shrink-0 items-center gap-1 border-b border-white/10 px-2 py-1">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-cyan-200">
            {t('game.actionLog.heading')}
          </span>

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              data-testid="action-log-expand"
              aria-label={isExpanded ? t('game.actionLog.collapseAria') : t('game.actionLog.expandAria')}
              aria-pressed={isExpanded}
              disabled={!isExpanded && mustStepAside}
              onClick={() => setActionLogExpanded(!isExpanded)}
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-white/25 bg-white/10 text-white/85 transition-[filter] hover:brightness-125 disabled:opacity-40"
            >
              {isExpanded ? <Minimize2 size={9} /> : <Maximize2 size={9} />}
            </button>
          </div>
        </div>

        {isConnected ? null : (
          <p data-testid="action-log-offline" className="shrink-0 px-2 py-1 text-[9px] font-semibold text-amber-200">
            {t('game.actionLog.offline')}
          </p>
        )}

        {entries.length === 0 ? (
          <p data-testid="action-log-empty" className="px-2 py-2 text-[10px] text-white/65">
            {t('game.actionLog.empty')}
          </p>
        ) : (
          <ol
            ref={listRef}
            data-testid="action-log-list"
            onScroll={handleScroll}
            className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain px-1.5 py-1"
          >
            {entries.map((entry, index) => {
              const previousEntry = index === 0 ? null : entries[index - 1]
              // A turn is one player's turn: the header changes only when the owner or their own turn ordinal does,
              // never because an entry happened to be written without turn context.
              const showTurnHeader = entry.turnOrdinal !== null
                && (previousEntry === null
                  || previousEntry.turnOrdinal !== entry.turnOrdinal
                  || previousEntry.turnOwner !== entry.turnOwner)

              return (
                <ActionLogEntryRow
                  key={entry.entryId}
                  entry={entry}
                  showTurnHeader={showTurnHeader}
                />
              )
            })}
          </ol>
        )}
      </div>
    </>
  )
}

function ActionLogEntryRow({ entry, showTurnHeader }: { entry: IActionLogViewEntry; showTurnHeader: boolean }) {
  const { t } = useTranslation()

  return (
    <li className="flex flex-col">
      {showTurnHeader ? (
        <span
          data-testid="action-log-turn"
          className="mt-1 text-[8px] font-bold uppercase tracking-[0.14em] text-white/45"
        >
          {entry.turnOwner === 'you'
            ? t('game.actionLog.yourTurn', { turn: entry.turnOrdinal ?? entry.turnNumber })
            : entry.turnOwner === 'opponent'
              ? t('game.actionLog.opponentTurn', { turn: entry.turnOrdinal ?? entry.turnNumber })
              : t('game.actionLog.turn', { turn: entry.turnNumber })}
        </span>
      ) : null}

      <span
        data-testid="action-log-entry"
        data-action-type={entry.actionType}
        data-entry-sequence={entry.sequence}
        className="flex items-start gap-1 rounded-lg border border-white/10 bg-white/[0.06] px-1.5 py-1"
      >
        <span
          className={twMerge(
            'mt-px shrink-0 rounded-sm border px-1 text-[8px] font-bold uppercase tracking-[0.06em]',
            ACTOR_CHIP_CLASS[entry.actor],
          )}
        >
          {t(ACTOR_LABEL_KEYS[entry.actor])}
        </span>
        <span className="min-w-0 flex-1 break-words">
          {entry.text}
        </span>
        {entry.details ? (
            <span data-testid="action-log-details" className="shrink-0 text-[8px] uppercase tracking-[0.06em] text-white/40">
              {"Turn Start"}
            </span>
          ) : null}
        {entry.phase ? (
          <span className="shrink-0 text-[8px] uppercase tracking-[0.06em] text-white/40">
            {formatActionLogEngineToken(entry.phase)}
          </span>
        ) : null}
      </span>
    </li>
  )
}

export { ActionLog }
