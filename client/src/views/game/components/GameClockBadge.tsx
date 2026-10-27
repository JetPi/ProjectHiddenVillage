import { useTranslation } from 'react-i18next'
import type { IGameClockResponse } from '@/services/api/types/game'
import { useGameClockCountdown } from '@/views/game/hooks/GameView/useGameClockCountdown'
import { formatClockSeconds } from '@/views/game/utils/functions/gameState/gameClock'

type IGameClockBadgeProps = {
  clock: IGameClockResponse | null | undefined
  authUserId?: string
}

type IGameClockCountdownProps = {
  clock: IGameClockResponse
  authUserId?: string
}

/**
 * The countdown of the stop the engine is waiting on, plus how close the player is to forfeiting.
 *
 * It renders nothing for an untimed game (the server says `isEnabled: false`) and shows a paused placeholder while a
 * system step or a phase presentation owns the table, so the absence of a number never looks like a bug.
 */
function GameClockBadge({ clock, authUserId }: IGameClockBadgeProps) {
  if (!clock?.isEnabled) {
    return null
  }

  return <GameClockCountdown clock={clock} authUserId={authUserId} />
}

function GameClockCountdown({ clock, authUserId }: IGameClockCountdownProps) {
  const { t } = useTranslation()
  const view = useGameClockCountdown(clock, authUserId)

  if (!view) {
    return null
  }

  const ownerLabel = view.isOwnClock ? t('game.clock.yourClock') : t('game.clock.opponentClock')
  const countdown = view.secondsRemaining === null ? t('game.clock.paused') : formatClockSeconds(view.secondsRemaining)
  const strikesLabel = view.strikes > 0
    ? t('game.clock.strikes', { count: view.strikes, max: view.forfeitAt })
    : null

  const themeClasses = view.isWarning
    ? 'border-rose-400 text-rose-500'
    : view.isOwnClock
      ? 'border-[var(--border-subtle)] text-[var(--text-primary)]'
      : 'border-[var(--border-subtle)] text-[var(--text-muted)]'

  return (
    <div
      role="timer"
      data-testid="game-clock-badge"
      data-own-clock={view.isOwnClock ? 'true' : 'false'}
      data-seconds-remaining={view.secondsRemaining ?? ''}
      data-timeouts={view.strikes}
      aria-label={`${ownerLabel} ${countdown}${strikesLabel ? ` ${strikesLabel}` : ''}`}
      title={strikesLabel ?? ownerLabel}
      className={`flex shrink-0 flex-col items-center justify-center rounded-md border bg-[var(--surface-muted)] px-1.5 py-0.5 leading-none transition-colors duration-200 ${themeClasses}`}
    >
      <span className="text-[12px] font-extrabold tabular-nums">{countdown}</span>
      <span className="text-[8px] uppercase tracking-[0.12em] opacity-70">{ownerLabel}</span>
      {strikesLabel ? (
        <span data-testid="game-clock-strikes" className="mt-0.5 text-[8px] font-semibold text-rose-500">
          {strikesLabel}
        </span>
      ) : null}
    </div>
  )
}

export { GameClockBadge }
export type { IGameClockBadgeProps }
