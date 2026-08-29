import { AppButton, Panel } from '@/components/ui'
import type { IGamePromptOverlayProps } from '@/views/game/types/promptOverlay'

function GamePromptOverlay({
  isOpen,
  prompt,
  isConnected,
  isActionPending,
  onResolve,
}: IGamePromptOverlayProps) {
  if (!isOpen || !prompt) {
    return null
  }

  const columnCount = Math.min(Math.max(prompt.options.length, 1), 3)

  return (
    <div data-testid="prompt-overlay" className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
      <Panel className="w-full max-w-sm p-5">
        <div className="mb-2">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">{prompt.title}</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{prompt.subtitle}</p>
        </div>
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
      </Panel>
    </div>
  )
}

export { GamePromptOverlay }
