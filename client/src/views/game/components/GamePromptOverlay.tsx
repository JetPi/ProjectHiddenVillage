import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import { twMerge } from 'tailwind-merge'
import { AppButton, Panel } from '@/components/ui'
import { CardImage } from '@/components/ui/cards'
import { CARD_ART_ASPECT_CLASS, CARD_SIZES } from '@/components/ui/cards/constants'
import { OVERLAY_ENTER_SPRING, OVERLAY_EXIT_TRANSITION } from '@/views/game/animation/tuning'
import type { IGamePromptOverlayProps } from '@/views/game/types'

function GamePromptOverlay(props: IGamePromptOverlayProps) {
  const isVisible = props.isOpen && props.prompt !== null

  return (
    <AnimatePresence>
      {isVisible ? <GamePromptOverlayPanel key="prompt-overlay" {...props} /> : null}
    </AnimatePresence>
  )
}

function GamePromptOverlayPanel({
  prompt,
  isConnected,
  isActionPending,
  onResolve,
  candidateCards,
}: IGamePromptOverlayProps) {
  const { t } = useTranslation()

  if (!prompt) {
    return null
  }

  const optionsById = new Set(prompt.options.map((option) => option.value))
  const visibleCandidates =
    prompt.promptType === 'Effect'
      ? (candidateCards ?? []).filter((card) => optionsById.has(card.instanceId))
      : []

  const columnCount = Math.min(Math.max(prompt.options.length, 1), 3)

  const isBoardInspectable = prompt.promptType === 'Mulligan'

  return (
    <motion.div
      data-testid="prompt-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: OVERLAY_EXIT_TRANSITION }}
      transition={OVERLAY_ENTER_SPRING}
      className={twMerge(
        'fixed inset-0 z-40 flex items-center justify-center px-4',
        isBoardInspectable ? 'pointer-events-none bg-black/25' : 'bg-black/40',
      )}
    >
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 6, transition: OVERLAY_EXIT_TRANSITION }}
        transition={OVERLAY_ENTER_SPRING}
        className={twMerge('flex w-full justify-center', isBoardInspectable && 'pointer-events-auto')}
      >
        <Panel
          className={twMerge(
            // Same ladder as the board behind it: a starting-player question should not be the smallest text on a
            // 4K screen. Width, padding and type all come from the surface's unit and the wide-screen type boost.
            'w-full p-[var(--game-dialog-padding)]',
            visibleCandidates.length > 0 ? 'max-w-[var(--game-dialog-width-2xl)]' : 'max-w-[var(--game-dialog-width-sm)]',
            isBoardInspectable && 'pointer-events-auto',
          )}
        >
          <div className="mb-2 text-center">
            <h2 className="text-[length:var(--game-dialog-font-2xl)] font-semibold text-[var(--text-primary)]">{prompt.title}</h2>
          </div>

          {visibleCandidates.length > 0 ? (
            <div
              data-testid="prompt-card-options"
              className="mt-4 grid max-h-[calc(384*var(--game-unit))] grid-cols-5 gap-[var(--game-dialog-gap)] overflow-y-auto themed-scrollbar"
            >
              {visibleCandidates.map((card) => (
                <button
                  key={card.instanceId}
                  type="button"
                  data-testid={`prompt-card-option-${card.instanceId}`}
                  onClick={() => {
                    onResolve(card.instanceId)
                  }}
                  disabled={!isConnected || isActionPending}
                  title={card.displayName}
                  className="group flex flex-col items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-1 transition-colors duration-150 hover:border-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className={twMerge('block w-full overflow-hidden rounded', CARD_ART_ASPECT_CLASS)}>
                    <CardImage
                      card={card.card ?? null}
                      variant="board"
                      sizes={CARD_SIZES.promptTile}
                      alt={card.displayName}
                      loading="eager"
                      className="h-full w-full object-cover"
                      fallbackLabel={card.displayName}
                    />
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div
              className="mt-4 grid gap-[var(--game-dialog-gap)]"
              style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
            >
              {prompt.options.map((option) => (
                <AppButton
                  key={option.value}
                  type="button"
                  data-testid={`prompt-option-${option.value}`}
                  onClick={() => {
                    onResolve(option.value)
                  }}
                  disabled={!isConnected || isActionPending}
                  className="w-full justify-center text-[length:var(--game-dialog-font-xl)]"
                >
                  {option.label}
                </AppButton>
              ))}
            </div>
          )}

          {isConnected ? null : (
            // The options are disabled while the hub is down, and an unexplained dead button reads as a bug. The
            // connection retries itself with a backoff (see useGameHubState), so this note is transient.
            <p
              data-testid="prompt-reconnecting-note"
              role="status"
              className="mt-3 text-center text-[length:var(--game-dialog-font-sm)] text-[var(--text-secondary)]"
            >
              {t('game.prompt.reconnecting')}
            </p>
          )}
        </Panel>
      </motion.div>
    </motion.div>
  )
}

export { GamePromptOverlay }
