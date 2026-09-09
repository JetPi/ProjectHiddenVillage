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
const DISABLED_RECOVERY_CLASSNAME = "mx-2 inline-flex h-5 w-5 items-center justify-center rounded-sm border border-white/35 bg-black/65 text-white transition-colors duration-150 hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-90"
const ENABLED_RECOVERY_CLASSNAME = "mx-2 inline-flex h-5 w-5 items-center justify-center rounded-sm border border-orange-400 bg-orange-800 text-orange-200 transition-colors duration-150 hover:bg-orange-700 hover:border-orange-400"

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
  disableInteractions = false,
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
  const isDisabled = !isConnected || isActionPending

  return (
    <>
      <PlayCard className={twMerge('group', className, surfaceClassName)} {...surfaceRestProps}>
        {shouldRenderBadge ? <CardOverlayBadge className='text-green-300'>{badgeValue}</CardOverlayBadge> : null}

        {previewCard && !hidePreviewButton && !disableInteractions ? (
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

        {!disableInteractions && leaderActionOptions.length > 0 ? (
          <div
            className={twMerge(
              'pointer-events-none absolute mx-auto inset-0 z-20 w-fit flex items-center content-center justify-center opacity-0 transition-opacity duration-200 ease-out group-hover:pointer-events-auto group-hover:opacity-100',
              
            )}
          >
              {leaderActionOptions.map((action) => (
                <button
                  key={action.actionId}
                  type="button"
                  disabled={isDisabled || !action.isEnabled}
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
        
        {
        !disableInteractions && recoveryAction ? (
          <div className="pointer-events-none absolute bottom-0 left-0 z-30 mb-1 opacity-0 transition-opacity duration-200 ease-out group-hover:pointer-events-auto group-hover:opacity-100">
            <button
              type="button"
              disabled={isDisabled || !recoveryAction.isEnabled}
              aria-label="Activate leader recovery"
              title={recoveryAction.disabledReason ?? recoveryAction.label}
              onClick={() => {
                onSelectActionOption?.(recoveryAction.actionId)
              }}
              className={isDisabled || !recoveryAction.isEnabled ? DISABLED_RECOVERY_CLASSNAME : ENABLED_RECOVERY_CLASSNAME}
            >
              <Flame size={10} />
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
