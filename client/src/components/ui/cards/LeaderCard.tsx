import { Eye } from 'lucide-react'
import { useState } from 'react'
import { twMerge } from 'tailwind-merge'
import { CardImage } from '@/components/ui/cards/CardImage'
import { CardOverlayBadge } from '@/components/ui/cards/CardOverlayBadge'
import { CardPreviewCard } from '@/components/ui/cards/CardPreviewCard'
import { PlayCard } from '@/components/ui/game/PlayCard'
import type { ILeaderCardProps } from '@/components/ui/types'

export function LeaderCard({
  className,
  surfaceProps,
  imageClassName,
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

  return (
    <>
      <PlayCard className={twMerge('group', className, surfaceClassName)} {...surfaceRestProps}>
        {shouldRenderBadge ? <CardOverlayBadge value={badgeValue} /> : null}

        {previewCard ? (
          <div className="pointer-events-none absolute right-1 top-1 z-30 opacity-0 transition-opacity duration-200 ease-out group-hover:pointer-events-auto group-hover:opacity-100">
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

        {actionOptions.length > 0 ? (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-end justify-center p-1 opacity-0 transition-opacity duration-200 ease-out group-hover:pointer-events-auto group-hover:opacity-100">
            <div className="grid w-full gap-0.5 rounded-md bg-black/45 p-1 backdrop-blur-[1px]">
              {actionOptions.map((action) => (
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
