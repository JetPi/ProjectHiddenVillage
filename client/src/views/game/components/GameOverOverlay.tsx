import { twMerge } from 'tailwind-merge'
import { useNavigate } from 'react-router-dom'
import { AppButton, Panel } from '@/components/ui'
import { buildGameOutcomePresentation } from '@/views/game/utils/functions/helpers'
import type { IGameOutcomeStanding, IGameOverOverlayProps } from '@/views/game/types'

const HEADLINE_CLASS: Record<IGameOutcomeStanding, string> = {
  victory: 'text-amber-200',
  defeat: 'text-rose-200',
  draw: 'text-slate-200',
}

/**
 * The result of a finished game. It is deliberately modal and not dismissible: the engine publishes no
 * action, prompt or reaction window once an outcome exists, so "return to main page" is the only thing
 * left to do on this screen. The DOM is the same language as the mulligan/effect prompt overlay
 * (`GamePromptOverlay`) - a full-screen backdrop with the panel drawing on top - and it sits above the
 * board's transient banners (z-60 vs their z-40/z-50) so a stale action error can never peek through.
 */
function GameOverOverlay({ outcome, authUserId }: IGameOverOverlayProps) {
  const navigate = useNavigate()
  const presentation = buildGameOutcomePresentation(outcome, authUserId)

  if (!presentation) {
    return null
  }

  return (
    <div
      data-testid="game-over-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-over-headline"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4"
    >
      <Panel className="w-full max-w-sm p-6 text-center">
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
          className="mt-5 w-full justify-center"
          onClick={() => {
            void navigate('/')
          }}
        >
          Return to main page
        </AppButton>
      </Panel>
    </div>
  )
}

export { GameOverOverlay }
