import { Eye } from 'lucide-react'
import { useState } from 'react'
import { twMerge } from 'tailwind-merge'
import { CardOverlayBadge, CardPreviewCard } from '@/components/ui/cards'
import type { INonLeaderCardOverlayProps } from '@/views/game/types'

const OVERLAY_VISIBILITY_CLASSNAME =
  'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100'

function NonLeaderCardOverlay({
  previewCard,
  zone,
  visibilityMode,
  actionOptions,
  hidePreviewButton = false,
  showEmptyActionMessage = true,
  suppressActionFallback = false,
  disableInteractions = false,
  isTargetCandidate = false,
  onChooseTarget,
  isSummonTargetCandidate = false,
  onToggleSummonTarget,
  isSummonTargetSelected = false,
  summonRequirementText = null,
  card,
  isConnected,
  isActionPending,
  onSelectActionOption,
}: INonLeaderCardOverlayProps) {
  const [isCardPreviewOpen, setIsCardPreviewOpen] = useState(false)
  const isHandZone = zone === 'hand'
  const showZoneHud = card !== undefined && zone === 'battlefield'
  const isChoosingTarget = isTargetCandidate === true
  const isTributeTargetCandidate = isSummonTargetCandidate === true
  const showPreviewButton = isChoosingTarget || isTributeTargetCandidate || !hidePreviewButton

  const hasActions = actionOptions.length > 0

  return (
    <>
      {showZoneHud && card ? (
        <>
          <CardOverlayBadge position="top-left" size='sm' className='w-4 text-red-900 bg-white'>{card.currentDamage}</CardOverlayBadge>
          <CardOverlayBadge position="top-right" size='sm'>
            <span className="text-red-300">{card.currentPower}</span>:<span className="text-green-300">{card.currentHealth}</span>
          </CardOverlayBadge>

        </>
      ) : null}
      <div
        className={twMerge(
          'card-overlay-controls absolute inset-0 z-20 rounded-md p-1 text-[9px] text-[var(--text-primary)] transition-opacity duration-200 ease-out',
          disableInteractions ? 'pointer-events-none opacity-0' : OVERLAY_VISIBILITY_CLASSNAME,
        )}
      >
        {!showPreviewButton ? null : (
          <div className="absolute right-2 top-2 z-30">
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
        )}

        <div className="flex h-full w-full items-start justify-center pt-6">
          {isChoosingTarget && onChooseTarget ? (
            <button
              type="button"
              onClick={() => {
                onChooseTarget()
              }}
              disabled={!isConnected || isActionPending}
              className="w-fit max-w-full rounded-sm border border-white/35 bg-black/65 px-1.5 py-0.5 text-center text-[8px] font-semibold uppercase tracking-[0.04em] text-white transition-colors duration-150 hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Choose
            </button>
          ) : isTributeTargetCandidate && onToggleSummonTarget ? (
            <button
              type="button"
              onClick={() => {
                onToggleSummonTarget()
              }}
              className="w-fit max-w-full rounded-sm border border-white/35 bg-black/65 px-1.5 py-0.5 text-center text-[8px] font-semibold uppercase tracking-[0.04em] text-white transition-colors duration-150 hover:bg-black/80"
            >
              Tribute
            </button>
          ) : hasActions ? (
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
          ) : !suppressActionFallback && showEmptyActionMessage ? (
            <div className="rounded-sm border border-dashed border-white/35 bg-black/65 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-[0.04em] text-white/90">
              {isHandZone ? 'No actions' : 'Actions pending backend wiring'}
            </div>
          ) : null}
        </div>
      </div>

      {visibilityMode === 'mixed' ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-between rounded-b-md border-t border-[var(--border-subtle)] bg-[var(--surface-elevated)]/95 px-1 py-0.5 text-[8px] font-bold uppercase tracking-[0.08em] text-[var(--text-primary)]">
          <span>{hasActions ? `${actionOptions.length} action${actionOptions.length > 1 ? 's' : ''}` : (showEmptyActionMessage ? 'No actions' : '')}</span>
          <span>View</span>
        </div>
      ) : null}

      {isTributeTargetCandidate && summonRequirementText ? (
        <div
          data-testid="tribute-requirement-label"
          title={summonRequirementText}
          className={twMerge(
            'pointer-events-none absolute inset-x-0 bottom-0 z-10 flex w-full items-center justify-center rounded-b-md border-t px-1 py-0.5 text-center text-[10px] font-extrabold leading-none',
            isSummonTargetSelected
              ? 'border-black/40 bg-amber-300/95 text-black' 
              : 'border-amber-300/40 bg-black/75 text-amber-200',
          )}
        >
          <span className="w-full truncate">{summonRequirementText}</span>
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
