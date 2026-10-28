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

function GameOverOverlay({ outcome, authUserId, onDismiss }: IGameOverOverlayProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const presentation = buildGameOutcomePresentation(outcome, authUserId)

  if (!presentation) {
    return null
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

        <AppButton
          type="button"
          data-testid="game-over-return-button"
          className="mt-2 w-full justify-center"
          onClick={() => {
            void navigate('/')
          }}
        >
          {t('game.outcome.returnToMainPage')}
        </AppButton>
      </Panel>
    </motion.div>
  )
}

export { GameOverOverlay }
