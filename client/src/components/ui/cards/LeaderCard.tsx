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
  imageClassName,
  leaderCard,
  placeholderLabel = 'Leader',
  showBadgeWhenLifeMissing = false,
  previewCard = null,
}: ILeaderCardProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)

  if (!leaderCard) {
    return (
      <PlayCard className={className}>
        <div className="flex h-full items-center justify-center text-center">{placeholderLabel}</div>
      </PlayCard>
    )
  }

  const shouldRenderBadge = showBadgeWhenLifeMissing || typeof leaderCard.currentLife === 'number'
  const badgeValue = leaderCard.currentLife ?? 0

  return (
    <>
      <PlayCard className={twMerge('group', className)}>
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
