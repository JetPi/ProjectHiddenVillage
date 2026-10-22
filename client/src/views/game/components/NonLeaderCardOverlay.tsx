import { Eye } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { twMerge } from 'tailwind-merge'
import { CardOverlayBadge, CardPreviewCard } from '@/components/ui/cards'
import { filterVisibleCardActions, resolveBattleRestrictionReason } from '@/views/game/utils/functions/cards'
import type { INonLeaderCardOverlayProps } from '@/views/game/types'
import { CardStatusBadgeRail } from './CardStatusBadgeRail'

const OVERLAY_VISIBILITY_CLASSNAME =
  'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100'

const ACTION_CHIP_CLASSNAME =
  'w-fit max-w-full rounded-sm border border-white/35 bg-black/65 px-1 py-0.5 text-center text-[8px] font-semibold uppercase tracking-[0.04em] text-white transition-colors duration-150 hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-60'

function NonLeaderCardOverlay({
  previewCard,
  zone,
  visibilityMode,
  actionOptions,
  hidePreviewButton = false,
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
  const { t } = useTranslation()
  const [isCardPreviewOpen, setIsCardPreviewOpen] = useState(false)
  const showZoneHud = card !== undefined && zone === 'battlefield'
  const isChoosingTarget = isTargetCandidate === true
  const isTributeTargetCandidate = isSummonTargetCandidate === true
  const showPreviewButton = isChoosingTarget || isTributeTargetCandidate || !hidePreviewButton

  // The Battle option is published even when the card cannot use it (the payload carries the reason), but a
  // greyed-out button reads as a bug on the board. Chips only show what can actually be clicked; the status
  // rail explains the restriction instead.
  const visibleActionOptions = filterVisibleCardActions(actionOptions)
  const battleRestrictionReason = resolveBattleRestrictionReason(actionOptions)
  const hasActions = visibleActionOptions.length > 0
  // The status rail is pinned: it used to slide up while a tribute requirement label was showing, which made the
  // badges jump the moment a target pick started. The label moves above the rail instead, so the badges never do.
  const hasStatusRail = (card?.statusEffects.length ?? 0) > 0
  const statusRailClassName = 'bottom-0.5 left-0.5'
  const tributeLabelClassName = hasStatusRail ? 'bottom-6' : 'bottom-0'

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
      {zone === 'battlefield' && card ? (
        <CardStatusBadgeRail
          statusEffects={card.statusEffects}
          cannotAttackReason={battleRestrictionReason}
          className={statusRailClassName}
        />
      ) : null}
      <div
        className={twMerge(
          'card-overlay-controls absolute inset-0 z-20 rounded-md p-1 text-[9px] text-[var(--text-primary)] transition-opacity duration-200 ease-out',
          disableInteractions
            ? 'pointer-events-none opacity-0'
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
              aria-label={t('game.zone.openCardDetails')}
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
              {t('game.zone.choose')}
            </button>
          ) : isTributeTargetCandidate && onToggleSummonTarget ? (
            <button
              type="button"
              onClick={() => {
                onToggleSummonTarget()
              }}
              className="w-fit max-w-full rounded-sm border border-white/35 bg-black/65 px-1.5 py-0.5 text-center text-[8px] font-semibold uppercase tracking-[0.04em] text-white transition-colors duration-150 hover:bg-black/80"
            >
              {t('game.zone.tribute')}
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
                // Fixed width: "Select" and "Selected" used to resize the chip, so it shifted under the cursor
                // on every toggle.
                'w-[4.25rem] max-w-full rounded-sm border px-1.5 py-0.5 text-center text-[8px] font-semibold uppercase tracking-[0.04em] transition-colors duration-150',
                isEffectTargetSelected
                  ? 'border-amber-300/90 bg-amber-300/85 text-black hover:bg-amber-200'
                  : 'border-white/35 bg-black/65 text-white hover:bg-black/80',
              )}
            >
              {isEffectTargetSelected ? t('game.zone.selected') : t('game.zone.select')}
            </button>
          ) : hasActions ? (
            <div className="grid w-full place-items-center gap-0.5">
              {visibleActionOptions.map((action) => (
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
          ) : null}
        </div>
      </div>

      {visibilityMode === 'mixed' ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-between rounded-b-md border-t border-[var(--border-subtle)] bg-[var(--surface-elevated)]/95 px-1 py-0.5 text-[8px] font-bold uppercase tracking-[0.08em] text-[var(--text-primary)]">
          <span>
            {hasActions
              ? visibleActionOptions.length === 1
                ? t('game.zone.actionCountOne', { n: visibleActionOptions.length })
                : t('game.zone.actionCountOther', { n: visibleActionOptions.length })
              : ''}
          </span>
          <span>{t('game.zone.view')}</span>
        </div>
      ) : null}

      {isTributeTargetCandidate && summonRequirementText ? (
          <div
            data-testid="tribute-requirement-label"
            title={summonRequirementText}
            className={twMerge(
              'card-overlay-requirement-label pointer-events-none absolute inset-x-0 z-10 flex w-full items-center justify-center rounded-b-md border-t px-1 py-0.5 text-center text-[10px] font-extrabold leading-none',
              tributeLabelClassName,
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
