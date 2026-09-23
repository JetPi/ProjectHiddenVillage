import { Eye } from 'lucide-react'
import { useState } from 'react'
import { twMerge } from 'tailwind-merge'
import { CardOverlayBadge, CardPreviewCard } from '@/components/ui/cards'
import type { INonLeaderCardOverlayProps } from '@/views/game/types'

const OVERLAY_VISIBILITY_CLASSNAME =
  'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100'

// Shared by every chip in the action list, including the "No actions" placeholder, so a card with no
// options keeps the same footprint and visual language as one with options.
const ACTION_CHIP_CLASSNAME =
  'w-fit max-w-full rounded-sm border border-white/35 bg-black/65 px-1 py-0.5 text-center text-[8px] font-semibold uppercase tracking-[0.04em] text-white transition-colors duration-150 hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-60'

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
  isEffectTargetCandidate = false,
  isEffectTargetSelected = false,
  onToggleEffectTarget,
  summonRequirementText = null,
  card,
  isConnected,
  isActionPending,
  onSelectActionOption,
}: INonLeaderCardOverlayProps) {
  const [isCardPreviewOpen, setIsCardPreviewOpen] = useState(false)
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
          disableInteractions
            ? 'pointer-events-none opacity-0'
            // A targeting action (Choose / Tribute / Select) is the only thing the card can do right now, so it
            // is shown without waiting for a hover - the player must not have to hunt for it.
            : isChoosingTarget || isTributeTargetCandidate || isEffectTargetCandidate
              ? 'pointer-events-auto opacity-100'
              : OVERLAY_VISIBILITY_CLASSNAME,
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
          ) : isEffectTargetCandidate && onToggleEffectTarget ? (
            <button
              type="button"
              data-testid="effect-target-toggle"
              aria-pressed={isEffectTargetSelected}
              onClick={() => {
                onToggleEffectTarget()
              }}
              className={twMerge(
                'w-fit max-w-full rounded-sm border px-1.5 py-0.5 text-center text-[8px] font-semibold uppercase tracking-[0.04em] transition-colors duration-150',
                isEffectTargetSelected
                  ? 'border-amber-300/90 bg-amber-300/85 text-black hover:bg-amber-200'
                  : 'border-white/35 bg-black/65 text-white hover:bg-black/80',
              )}
            >
              {isEffectTargetSelected ? 'Selected' : 'Select'}
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
                  className={ACTION_CHIP_CLASSNAME}
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : !suppressActionFallback && showEmptyActionMessage ? (
            <div className="grid w-full place-items-center gap-0.5">
              <button
                type="button"
                data-testid="card-no-actions-chip"
                disabled
                className={ACTION_CHIP_CLASSNAME}
              >
                No actions
              </button>
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
            'card-overlay-requirement-label pointer-events-none absolute inset-x-0 bottom-0 z-10 flex w-full items-center justify-center rounded-b-md border-t px-1 py-0.5 text-center text-[10px] font-extrabold leading-none',
            isSummonTargetSelected
              ? 'border-amber-300/40 bg-black/75 text-amber-200'
              : 'border-black/40 bg-amber-300/95 text-black',
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
