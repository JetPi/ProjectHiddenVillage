import { Eye } from 'lucide-react'
import { useMemo, useState } from 'react'
import { twMerge } from 'tailwind-merge'
import { CardPreviewCard } from '@/components/ui/cards'
import type { INonLeaderCardOverlayProps } from '@/views/game/types/nonLeaderCardOverlay'

function NonLeaderCardOverlay({
  previewCard,
  zone,
  visibilityMode,
  actionOptions,
  suppressActionFallback = false,
  isConnected,
  isActionPending,
  onSelectActionOption,
}: INonLeaderCardOverlayProps) {
  const [isCardPreviewOpen, setIsCardPreviewOpen] = useState(false)
  const isHandZone = zone === 'hand'

  const overlayVisibilityClassName = useMemo(() => {
    if (visibilityMode === 'mixed') {
      return 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100'
    }

    return 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100'
  }, [visibilityMode])

  const hasActions = actionOptions.length > 0

  return (
    <>
      <div
        className={twMerge(
          'absolute inset-0 z-20 rounded-md p-1 text-[9px] text-[var(--text-primary)] transition-opacity duration-200 ease-out',
          overlayVisibilityClassName,
        )}
      >
        <div className="absolute right-1 top-1 z-30">
          <button
            type="button"
            onClick={() => {
              setIsCardPreviewOpen(true)
            }}
            aria-label="Open card details"
            className="inline-flex h-5 w-5 items-center justify-center rounded-sm border border-white/35 bg-black/65 text-white transition-colors duration-150 hover:bg-black/80"
          >
            <Eye size={10} />
          </button>
        </div>

        <div className="flex h-full w-full items-start justify-center pt-6">
          {hasActions ? (
            <div className="grid w-full place-items-center gap-0.5">
              {actionOptions.map((action) => (
                <button
                  key={action.actionId}
                  type="button"
                  onClick={() => {
                    onSelectActionOption(action.actionId)
                  }}
                  disabled={!isConnected || isActionPending || !action.isEnabled}
                  title={action.disabledReason ?? undefined}
                  className="w-fit max-w-full rounded-sm border border-white/35 bg-black/65 px-1 py-0.5 text-center text-[8px] font-semibold uppercase tracking-[0.04em] text-white transition-colors duration-150 hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : !suppressActionFallback ? (
            <div className="rounded-sm border border-dashed border-white/35 bg-black/65 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-[0.04em] text-white/90">
              {isHandZone ? 'No actions' : 'Actions pending backend wiring'}
            </div>
          ) : null}
        </div>
      </div>

      {visibilityMode === 'mixed' ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-between rounded-b-md border-t border-[var(--border-subtle)] bg-[var(--surface-elevated)]/95 px-1 py-0.5 text-[8px] font-bold uppercase tracking-[0.08em] text-[var(--text-primary)]">
          <span>{hasActions ? `${actionOptions.length} action${actionOptions.length > 1 ? 's' : ''}` : 'No actions'}</span>
          <span>View</span>
        </div>
      ) : null}

      {previewCard ? (
        <CardPreviewCard
          card={previewCard}
          isOpen={isCardPreviewOpen}
          onClose={() => setIsCardPreviewOpen(false)}
        />
      ) : null}
    </>
  )
}

export { NonLeaderCardOverlay }
