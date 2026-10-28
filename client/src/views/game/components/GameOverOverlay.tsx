import { useState } from 'react'
import { twMerge } from 'tailwind-merge'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { AppButton, Panel } from '@/components/ui'
import { OVERLAY_ENTER_SPRING } from '@/views/game/animation/tuning'
import { buildGameOutcomePresentation } from '@/views/game/utils/functions/helpers'
import type { IGameOutcomeStanding, IGameOverOverlayProps } from '@/views/game/types'
import { X } from 'lucide-react'

const HEADLINE_CLASS: Record<IGameOutcomeStanding, string> = {
  victory: 'text-amber-200',
  defeat: 'text-rose-200',
  draw: 'text-slate-200',
}

function normalizePlayerId(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/-/g, '')
}

function GameOverOverlay({
  outcome,
  authUserId,
  onDismiss,
  rematch,
  onRequestRematch,
  onAcceptRematch,
  onDeclineRematch,
}: IGameOverOverlayProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [isRematchBusy, setIsRematchBusy] = useState(false)
  const presentation = buildGameOutcomePresentation(outcome, authUserId)

  if (!presentation) {
    return null
  }

  const requestingPlayerId = normalizePlayerId(rematch?.requestedByPlayerId)
  const isOwnOffer = Boolean(rematch) && requestingPlayerId === normalizePlayerId(authUserId)
  const isReserved = Boolean(rematch?.reservedCode)
  const isDeclined = Boolean(rematch?.declinedByPlayerId)

  const runRematchAction = async (action: (() => Promise<boolean>) | undefined): Promise<void> => {
    if (!action || isRematchBusy) {
      return
    }

    setIsRematchBusy(true)

    try {
      await action()
    } finally {
      setIsRematchBusy(false)
    }
  }

  return (
    <motion.div
      data-testid="game-over-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-over-headline"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={OVERLAY_ENTER_SPRING}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4"
    >
      <Panel className="relative w-full max-w-sm p-6 text-center">
        {/* A corner affordance rather than a third action: dismissing means "take this off my board", so it stays
            small and out of the reading order of the result itself. */}
        <button
          type="button"
          data-testid="game-over-review-button"
          aria-label={t('game.outcome.reviewBoard')}
          title={t('game.outcome.reviewBoard')}
          onClick={onDismiss}
          className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--text-secondary)] transition-[filter,color] hover:brightness-125 hover:text-[var(--text-primary)]"
        >
          <X size={11} strokeWidth={2.5} />
        </button>
        <p
          id="game-over-headline"
          data-testid="game-over-headline"
          data-standing={presentation.standing}
          className={twMerge(
            'text-3xl font-extrabold uppercase tracking-[0.2em]',
            HEADLINE_CLASS[presentation.standing],
          )}
        >
          {presentation.headline}
        </p>

        <p data-testid="game-over-reason" className="mt-3 text-sm text-[var(--text-secondary)]">
          {presentation.reason}
        </p>

        {/* Both players agreed: the board has nothing left to offer. This note is the last thing they read here -
            the view is already taking them to the login view with the reserved code, where the deck for the next
            match is chosen. */}
        {isReserved ? (
          <div data-testid="rematch-reserved-note" className="mt-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-left">
            <p className="text-xs font-semibold text-[var(--text-primary)]">
              {t('game.rematch.reservedHeadline')}
            </p>
            <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
              {t('game.rematch.reservedHint', {
                code: rematch?.reservedCode ?? '',
                ruleset: rematch?.rulesetName ?? t('game.rematch.noRuleset'),
              })}
            </p>
          </div>
        ) : null}

        {isDeclined ? (
          <p data-testid="rematch-declined-note" className="mt-4 text-xs text-[var(--text-secondary)]">
            {t('game.rematch.declined')}
          </p>
        ) : null}

        {rematch && !isOwnOffer && !isReserved && !isDeclined ? (
          <p data-testid="rematch-offer-note" className="mt-4 text-xs text-[var(--text-secondary)]">
            {t('game.rematch.incomingOffer')}
          </p>
        ) : null}

        {rematch && isOwnOffer && !isReserved && !isDeclined ? (
          <p data-testid="rematch-waiting-note" className="mt-4 text-xs text-[var(--text-secondary)]">
            {t('game.rematch.waitingForOpponent')}
          </p>
        ) : null}

        <div className="mt-4 flex flex-col gap-2">
          {!isReserved && rematch && !isOwnOffer ? (
            <>
              <AppButton
                type="button"
                data-testid="rematch-accept-button"
                className="w-full justify-center"
                disabled={isRematchBusy}
                onClick={() => void runRematchAction(onAcceptRematch)}
              >
                {t('game.rematch.accept')}
              </AppButton>
              <AppButton
                type="button"
                data-testid="rematch-decline-button"
                className="w-full justify-center"
                disabled={isRematchBusy}
                onClick={() => void runRematchAction(onDeclineRematch)}
              >
                {t('game.rematch.decline')}
              </AppButton>
            </>
          ) : null}

          {!isReserved && (!rematch || isDeclined) ? (
            <AppButton
              type="button"
              data-testid="rematch-offer-button"
              className="w-full justify-center"
              disabled={isRematchBusy}
              onClick={() => void runRematchAction(onRequestRematch)}
            >
              {t('game.rematch.offer')}
            </AppButton>
          ) : null}

          {!isReserved && rematch && isOwnOffer ? (
            <AppButton
              type="button"
              data-testid="rematch-withdraw-button"
              className="w-full justify-center"
              disabled={isRematchBusy}
              onClick={() => void runRematchAction(onDeclineRematch)}
            >
              {t('game.rematch.withdraw')}
            </AppButton>
          ) : null}

          <AppButton
            type="button"
            data-testid="game-over-return-button"
            className="w-full justify-center"
            onClick={() => {
              void navigate('/')
            }}
          >
            {t('game.outcome.returnToMainPage')}
          </AppButton>
        </div>
      </Panel>
    </motion.div>
  )
}

export { GameOverOverlay }
