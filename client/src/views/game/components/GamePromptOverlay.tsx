import { twMerge } from 'tailwind-merge'
import { AppButton, Panel } from '@/components/ui'
import { CardImage } from '@/components/ui/cards'
import type { IGamePromptOverlayProps } from '@/views/game/types'

function GamePromptOverlay({
  isOpen,
  prompt,
  isConnected,
  isActionPending,
  onResolve,
  candidateCards,
}: IGamePromptOverlayProps) {
  if (!isOpen || !prompt) {
    return null
  }

  // An effect selection prompt ("choose a card from your hand to place on top of your deck") carries card
  // instance ids, so the player picks by clicking the card face rather than by reading an option label.
  const optionsById = new Set(prompt.options.map((option) => option.value))
  const visibleCandidates =
    prompt.promptType === 'Effect'
      ? (candidateCards ?? []).filter((card) => optionsById.has(card.instanceId))
      : []

  const columnCount = Math.min(Math.max(prompt.options.length, 1), 3)

  // The mulligan decision is made while looking at the opening hand, so that prompt must not lock the board:
  // the backdrop stays transparent to pointer events (only the panel itself is interactive), which lets the
  // player hover a hand card, reveal its eye and open the details modal. Nothing else is submit-able during a
  // pending prompt - the server publishes only `resolve-prompt:*` while it waits for this player's answer.
  const isBoardInspectable = prompt.promptType === 'Mulligan'

  return (
    <div
      data-testid="prompt-overlay"
      className={twMerge(
        'fixed inset-0 z-40 flex items-center justify-center px-4',
        isBoardInspectable ? 'pointer-events-none bg-black/25' : 'bg-black/40',
      )}
    >
      <Panel className={twMerge('w-full max-w-sm p-5', isBoardInspectable && 'pointer-events-auto')}>
        <div className="mb-2 text-center">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">{prompt.title}</h2>
        </div>

        {visibleCandidates.length > 0 ? (
          <div
            data-testid="prompt-card-options"
            className="mt-4 grid max-h-[24rem] gap-2 overflow-y-auto themed-scrollbar"
            style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(visibleCandidates.length, 1), 3)}, minmax(0, 1fr))` }}
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
                <span className="block aspect-[600/831] w-full overflow-hidden rounded">
                  <CardImage
                    card={card.card ?? null}
                    variant="board"
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
            className="mt-4 grid gap-2"
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
                className="w-full justify-center"
              >
                {option.label}
              </AppButton>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}

export { GamePromptOverlay }
