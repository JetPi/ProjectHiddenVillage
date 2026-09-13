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
const LEADER_OVERLAY_CONTAINER_CLASSNAME = 'card-overlay-controls pointer-events-none absolute mx-auto inset-0 z-20 gap-1 w-fit flex flex-col items-center content-center justify-center opacity-0 transition-opacity duration-200 ease-out group-hover:pointer-events-auto group-hover:opacity-100'
const LEADER_ACTION_BUTTON_CLASSNAME = 'w-full rounded-sm border border-white/35 bg-black/65 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-[0.04em] text-white transition-colors duration-150 hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-60'
const LEADER_CHOOSE_BUTTON_CLASSNAME = 'w-fit max-w-full rounded-sm border border-white/35 bg-black/65 px-1.5 py-0.5 text-center text-[8px] font-semibold uppercase tracking-[0.04em] text-white transition-colors duration-150 hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-60'

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
  isTargetCandidate = false,
  onChooseTarget,
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
  const isChoosingTarget = isTargetCandidate === true
  const showPreviewButton = isChoosingTarget || !hidePreviewButton
  const showOverlayControls = !disableInteractions

  return (
    <>
      <PlayCard className={twMerge('group', className, surfaceClassName)} {...surfaceRestProps}>
    <>
          <CardOverlayBadge position="top-left" size='md' className='w-4 text-red-900 bg-white'>{leaderCard.currentDamage}</CardOverlayBadge>
          <CardOverlayBadge position="top-right" size='md'>
            <span className="text-red-300">{leaderCard.currentPower}</span>
          </CardOverlayBadge>

        </>
        {shouldRenderBadge ? <CardOverlayBadge className='text-green-300'>{badgeValue}</CardOverlayBadge> : null}

        {previewCard && showPreviewButton && showOverlayControls ? (
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

        {showOverlayControls && isChoosingTarget && onChooseTarget ? (
          <div className={LEADER_OVERLAY_CONTAINER_CLASSNAME}>
            <button
              type="button"
              onClick={() => {
                onChooseTarget()
              }}
              disabled={isDisabled}
              className={LEADER_CHOOSE_BUTTON_CLASSNAME}
            >
              Choose
            </button>
          </div>
        ) : null}

        {showOverlayControls && !isChoosingTarget && leaderActionOptions.length > 0 ? (
          <div className={LEADER_OVERLAY_CONTAINER_CLASSNAME}>
              {leaderActionOptions.map((action) => (
                <button
                  key={action.actionId}
                  type="button"
                  disabled={isDisabled || !action.isEnabled}
                  title={action.disabledReason ?? undefined}
                  onClick={() => {
                    onSelectActionOption?.(action.actionId)
                  }}
                  className={LEADER_ACTION_BUTTON_CLASSNAME}
                >
                  {action.label}
                </button>
              ))}
            
          </div>
        ) : null}
        
        {
        showOverlayControls && !isChoosingTarget && recoveryAction ? (
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
