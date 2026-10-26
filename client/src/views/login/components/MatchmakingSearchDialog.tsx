import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppButton, Panel } from '@/components/ui'
import { useCancelMatchMutation, useMatchTicketQuery } from '@/services/queries/matchmakingQueries'
import { useRulesetWaitingCount } from '@/services/presence/usePresence'
import type { IMatchTicket } from '@/types/matchmaking'

export type IMatchmakingSearchDialogProps = {
  ticket: IMatchTicket
  onMatched: (gameId: string) => void
  onDismiss: () => void
}

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/**
 * Holds the player on the login view while the server looks for an opponent under the same ruleset. The polling
 * lives in the query hook, so both the "matched" hand-off and the "expired" notice happen without a timer here.
 */
export function MatchmakingSearchDialog({ ticket, onMatched, onDismiss }: IMatchmakingSearchDialogProps) {
  const { t } = useTranslation()
  const ticketQuery = useMatchTicketQuery(ticket.ticketId)
  const cancelMutation = useCancelMatchMutation()
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const currentTicket = ticketQuery.data ?? ticket
  const waitingPlayers = useRulesetWaitingCount(currentTicket.rulesetId)

  useEffect(() => {
    const startedAtMs = Date.parse(ticket.enqueuedAtUtc)
    const update = () => {
      const elapsedMs = Number.isNaN(startedAtMs) ? 0 : Date.now() - startedAtMs
      setElapsedSeconds(Math.max(0, Math.floor(elapsedMs / 1000)))
    }

    update()
    const timer = window.setInterval(update, 1000)

    return () => window.clearInterval(timer)
  }, [ticket.enqueuedAtUtc])

  useEffect(() => {
    if (currentTicket.state === 'matched' && currentTicket.gameId) {
      onMatched(currentTicket.gameId)
      return
    }

    if (currentTicket.state === 'expired' || currentTicket.state === 'cancelled') {
      onDismiss()
    }
  }, [currentTicket.state, currentTicket.gameId, onMatched, onDismiss])

  const handleCancel = () => {
    cancelMutation.mutate(ticket.ticketId, {
      onSettled: () => onDismiss(),
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="matchmaking-search-title"
    >
      <Panel className="w-full max-w-sm p-5 text-center">
        <h2
          id="matchmaking-search-title"
          className="text-lg font-semibold text-[var(--text-primary)]"
        >
          {t('auth.matchmaking.searchingTitle', { ruleset: currentTicket.rulesetName })}
        </h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {t('auth.matchmaking.searchingBody')}
        </p>
        {waitingPlayers !== null ? (
          <p
            data-testid="matchmaking-waiting-players"
            className="mt-1 text-xs text-[var(--text-muted)]"
          >
            {t('auth.matchmaking.waitingPlayers', { count: waitingPlayers })}
          </p>
        ) : null}
        <p
          data-testid="matchmaking-elapsed"
          className="mt-3 text-2xl font-semibold tabular-nums text-[var(--text-primary)]"
        >
          {formatElapsed(elapsedSeconds)}
        </p>
        <div className="mt-4 flex justify-center">
          <AppButton
            type="button"
            variant="ghost"
            onClick={handleCancel}
            disabled={cancelMutation.isPending}
            data-testid="matchmaking-cancel"
          >
            {cancelMutation.isPending
              ? t('auth.matchmaking.cancelling')
              : t('auth.matchmaking.cancel')}
          </AppButton>
        </div>
      </Panel>
    </div>
  )
}
