import { useTranslation } from 'react-i18next'
import { twMerge } from 'tailwind-merge'

export type IOpponentPresenceIndicatorProps = {
  isPresent: boolean
  className?: string
}

/**
 * The opponent's status light on the board: green while they are watching it, red once they have gone.
 *
 * Deliberately a dot and nothing more - no text, no panel, no pulse. Presence is the server's answer and it tolerates a
 * refresh (`RematchOptions.OpponentPresenceGraceSeconds`), so reloading a page does not turn it red; the wording lives
 * on `aria-label`/`title` for whoever needs it read out rather than on the board.
 */
function OpponentPresenceIndicator({ isPresent, className }: IOpponentPresenceIndicatorProps) {
  const { t } = useTranslation()
  const label = isPresent ? t('game.presence.present') : t('game.presence.away')

  return (
    <span
      data-testid="opponent-presence-indicator"
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

export { OpponentPresenceIndicator }
