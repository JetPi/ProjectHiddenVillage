import { useTranslation } from 'react-i18next'
import { twMerge } from 'tailwind-merge'

export type IPlayerPresenceIndicatorProps = {
  isPresent: boolean
  /** The player this dot reports on, so the status is understandable without the name drawn beside it. */
  playerName?: string | null
  testId?: string
  className?: string
}

/**
 * One player's status light: green while they are watching the board, red once they have gone.
 *
 * Deliberately a dot and nothing more - no text, no panel, no pulse; the name it belongs to is drawn beside it by the
 * side rail. Presence is the server's answer and it tolerates a refresh (`RematchOptions.OpponentPresenceGraceSeconds`),
 * so reloading a page does not turn it red. The wording lives on `aria-label` / `title` for whoever needs it read out.
 */
function PlayerPresenceIndicator({ isPresent, playerName, testId, className }: IPlayerPresenceIndicatorProps) {
  const { t } = useTranslation()
  const status = isPresent ? t('game.presence.present') : t('game.presence.away')
  const trimmedName = playerName?.trim() ?? ''
  const label = trimmedName ? `${trimmedName}: ${status}` : status

  return (
    <span
      data-testid={testId ?? 'player-presence-indicator'}
      data-present={isPresent ? 'true' : 'false'}
      role="img"
      aria-label={label}
      title={label}
      className={twMerge(
        'pointer-events-none inline-block h-2 w-2 shrink-0 rounded-full ring-1 ring-black/50 transition-colors duration-300',
        isPresent ? 'bg-emerald-400' : 'bg-rose-500',
        className,
      )}
    />
  )
}

export { PlayerPresenceIndicator }
