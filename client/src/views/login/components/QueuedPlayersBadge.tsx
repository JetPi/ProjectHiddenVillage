import { Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export type IQueuedPlayersBadgeProps = {
  count: number
}

/**
 * Queue depth for one format, pinned to the right of its select row. The digit is visual; the screen-reader text
 * says what it counts, because an icon plus a bare number does not.
 */
export function QueuedPlayersBadge({ count }: IQueuedPlayersBadgeProps) {
  const { t } = useTranslation()

  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold tabular-nums text-current opacity-70">
      <Users size={12} aria-hidden="true" />
      <span data-testid="queued-players-count" aria-hidden="true">
        {count}
      </span>
      <span className="sr-only">{t('auth.matchmaking.queuedCount', { count })}</span>
    </span>
  )
}
