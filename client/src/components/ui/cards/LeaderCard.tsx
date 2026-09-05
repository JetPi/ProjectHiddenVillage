import { Eye, Flame } from 'lucide-react'
import { useState } from 'react'
import { twMerge } from 'tailwind-merge'
import { CardImage } from '@/components/ui/cards/CardImage'
import { CardOverlayBadge } from '@/components/ui/cards/CardOverlayBadge'
import { CardPreviewCard } from '@/components/ui/cards/CardPreviewCard'
import { PlayCard } from '@/components/ui/game/PlayCard'
import type { ILeaderCardProps } from '@/components/ui/types'
import type { IGameActionOptionResponse } from '@/services/api/types/game'

const RECOVERY_ACTION_LABEL = 'Recovery'

function splitRecoveryAction(actionOptions: IGameActionOptionResponse[]): {
  actionOptions: IGameActionOptionResponse[]
  recoveryAction: IGameActionOptionResponse | null
} {
  const recoveryAction =
    actionOptions.find(
      (action) => action.label.trim().toLowerCase() === RECOVERY_ACTION_LABEL.toLowerCase(),
    ) ?? null

  if (!recoveryAction) {
    return { actionOptions, recoveryAction: null }
  }

  return {
    actionOptions: actionOptions.filter((action) => action.actionId !== recoveryAction.actionId),
    recoveryAction,
  }
}

export function LeaderCard({
  className,
  surfaceProps,
  imageClassName,
  hidePreviewButton = false,
  leaderCard,
  placeholderLabel = 'Leader',
  showBadgeWhenLifeMissing = false,
  previewCard = null,
  actionOptions = [],
  isConnected = true,
  isActionPending = false,
  onSelectActionOption,
}: ILeaderCardProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const { className: surfaceClassName, ...surfaceRestProps } = surfaceProps ?? {}

  if (!leaderCard) {
    return (
      <PlayCard className={twMerge(className, surfaceClassName)} {...surfaceRestProps}>
        <div className="flex h-full items-center justify-center text-center">{placeholderLabel}</div>
      </PlayCard>
    )
  }

  const shouldRenderBadge = showBadgeWhenLifeMissing || typeof leaderCard.currentLife === 'number'
  const badgeValue = leaderCard.currentLife ?? 0
  const { actionOptions: leaderActionOptions, recoveryAction } = splitRecoveryAction(actionOptions)

  return (
    <>
      <PlayCard className={twMerge('group', className, surfaceClassName)} {...surfaceRestProps}>
        {shouldRenderBadge ? <CardOverlayBadge value={badgeValue} /> : null}

        {previewCard && !hidePreviewButton ? (
          <div className="pointer-events-none absolute right-2 top-2 z-30 opacity-0 transition-opacity duration-200 ease-out group-hover:pointer-events-auto group-hover:opacity-100">
            <button
              type="button"
              onClick={() => setIsPreviewOpen(true)}
              aria-label="Open leader card details"
              className="inline-flex h-5 w-5 items-center justify-center rounded-sm border border-white/35 bg-black/65 text-white transition-colors duration-150 hover:bg-black/80"
            >
              <Eye size={10} />
            </button>
          </div>
        ) : null}

        <CardImage
          src={leaderCard.image}
          alt={leaderCard.displayName || leaderCard.id}
          loading="eager"
          className={imageClassName}
        />

        {leaderActionOptions.length > 0 ? (
          <div
            className={twMerge(
              'pointer-events-none absolute mx-auto inset-0 z-20 w-fit flex items-center content-center justify-center opacity-0 transition-opacity duration-200 ease-out group-hover:pointer-events-auto group-hover:opacity-100',
              
            )}
          >
              {leaderActionOptions.map((action) => (
                <button
                  key={action.actionId}
                  type="button"
                  disabled={!isConnected || isActionPending || !action.isEnabled}
                  title={action.disabledReason ?? undefined}
                  onClick={() => {
                    onSelectActionOption?.(action.actionId)
                  }}
                  className="w-full rounded-sm border border-white/35 bg-black/65 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-[0.04em] text-white transition-colors duration-150 hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {action.label}
                </button>
              ))}
            
          </div>
        ) : null}
        
        {recoveryAction ? (
          <div className="absolute bottom-0 left-0 z-30">
            <button
              type="button"
              disabled={!isConnected || isActionPending || !recoveryAction.isEnabled}
              aria-label="Activate leader recovery"
              title={recoveryAction.disabledReason ?? recoveryAction.label}
              onClick={() => {
                onSelectActionOption?.(recoveryAction.actionId)
              }}
              className="mx-2 inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate-700/92 text-orange-300 transition-colors duration-150 hover:bg-slate-600/92 disabled:cursor-not-allowed disabled:text-slate-400 disabled:opacity-100"
            >
              <Flame size={14} />
            </button>
          </div>
        ) : null}
      </PlayCard>

      {previewCard ? (
        <CardPreviewCard
          card={previewCard}
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
        />
      ) : null}
    </>
  )
}
