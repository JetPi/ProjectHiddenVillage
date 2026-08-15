import { CardImage } from '@/components/ui/cards/CardImage'
import { CardOverlayBadge } from '@/components/ui/cards/CardOverlayBadge'
import { PlayCard } from '@/components/ui/game/PlayCard'
import type { ILeaderCardProps } from '@/components/ui/types'

export function LeaderCard({
  className,
  imageClassName,
  leaderCard,
  placeholderLabel = 'Leader',
  showBadgeWhenLifeMissing = false,
}: ILeaderCardProps) {
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
    <PlayCard className={className}>
      {shouldRenderBadge ? <CardOverlayBadge value={badgeValue} /> : null}
      <CardImage
        src={leaderCard.image}
        alt={leaderCard.displayName || leaderCard.id}
        loading="eager"
        className={imageClassName}
      />
    </PlayCard>
  )
}
