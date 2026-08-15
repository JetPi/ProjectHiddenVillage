import { Eye, EyeOff } from 'lucide-react'
import { useMemo, useState } from 'react'
import { twMerge } from 'tailwind-merge'
import type { INonLeaderCardOverlayProps } from '@/views/game/types/nonLeaderCardOverlay'

function NonLeaderCardOverlay({
  zone,
  visibilityMode,
  actionOptions,
  isConnected,
  isActionPending,
  onSelectActionOption,
}: INonLeaderCardOverlayProps) {
  const [isPinnedVisible, setIsPinnedVisible] = useState(false)
  const isHandZone = zone === 'hand'

  const overlayVisibilityClassName = useMemo(() => {
    if (isPinnedVisible) {
      return 'opacity-100'
    }

    if (visibilityMode === 'mixed') {
      return 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100'
    }

    return 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100'
  }, [isPinnedVisible, visibilityMode])

  const hasActions = !isHandZone && actionOptions.length > 0

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
              setIsPinnedVisible((currentValue) => !currentValue)
            }}
            aria-label={isPinnedVisible ? 'Hide card overlay' : 'Show card overlay'}
            aria-pressed={isPinnedVisible}
            className="inline-flex h-5 w-5 items-center justify-center rounded-sm border border-white/35 bg-black/65 text-white transition-colors duration-150 hover:bg-black/80"
          >
            {isPinnedVisible ? <EyeOff size={10} /> : <Eye size={10} />}
          </button>
        </div>

        <div className="flex h-full w-full items-start justify-center pt-6">
          {hasActions ? (
            <div className="grid w-[92%] max-w-[8.5rem] grid-cols-1 gap-0.5">
              {actionOptions.map((action) => (
                <button
                  key={action.actionId}
                  type="button"
                  onClick={() => {
                    onSelectActionOption(action.actionId)
                  }}
                  disabled={!isConnected || isActionPending || !action.isEnabled}
                  title={action.disabledReason ?? undefined}
                  className="truncate rounded-sm border border-white/35 bg-black/65 px-1 py-0.5 text-left text-[8px] font-semibold uppercase tracking-[0.04em] text-white transition-colors duration-150 hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-sm border border-dashed border-white/35 bg-black/65 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-[0.04em] text-white/90">
              {isHandZone ? 'pHolder' : 'Actions pending backend wiring'}
            </div>
          )}
        </div>
      </div>

      {visibilityMode === 'mixed' ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-between rounded-b-md border-t border-[var(--border-subtle)] bg-[var(--surface-elevated)]/95 px-1 py-0.5 text-[8px] font-bold uppercase tracking-[0.08em] text-[var(--text-primary)]">
          <span>{hasActions ? `${actionOptions.length} action${actionOptions.length > 1 ? 's' : ''}` : 'No actions'}</span>
          <span>{isPinnedVisible ? 'Pinned' : 'Hover'}</span>
        </div>
      ) : null}
    </>
  )
}

export { NonLeaderCardOverlay }
