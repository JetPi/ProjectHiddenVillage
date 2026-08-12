import { CardImage } from './CardImage'
import { CardOverlayBadge } from './CardOverlayBadge'
import { PlayCard } from './PlayCard'
import type { ILeaderCardProps } from './types'

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
