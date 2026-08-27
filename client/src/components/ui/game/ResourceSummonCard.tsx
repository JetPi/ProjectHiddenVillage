import { PlayCard } from '@/components/ui/game/PlayCard'
import { CardImage } from '@/components/ui/cards/CardImage'
import summonCardImage from '@/assets/SummonCard.webp'
import { twMerge } from 'tailwind-merge'
import type { IResourceSummonCardProps } from '@/components/ui/types'

const RESOURCE_CARD_FRAME_CLASS = 'h-full max-h-full overflow-hidden rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-muted)]'
const RESOURCE_CARD_IMAGE_CLASS = 'h-full w-full rounded-none object-contain p-[1px] [image-rendering:auto] [transform:translateZ(0)]'
const RESOURCE_CARD_SCALE_CLASS = 'scale-[var(--resource-card-scale)]'

export function ResourceSummonCard({ isSummonCardReady = true, className }: IResourceSummonCardProps) {
  const largeCardFrameClassName = twMerge(
    RESOURCE_CARD_FRAME_CLASS,
    'border-transparent bg-transparent p-0.5',
  )

  return (
    <PlayCard
      className={twMerge(
        largeCardFrameClassName,
        'transition-transform duration-300 ease-out will-change-transform origin-center',
        isSummonCardReady ? `rotate-0 ${RESOURCE_CARD_SCALE_CLASS}` : `rotate-90 ${RESOURCE_CARD_SCALE_CLASS}`,
        className,
      )}
    >
      <CardImage
        src={summonCardImage}
        alt="Summon card"
        className={RESOURCE_CARD_IMAGE_CLASS}
      />
    </PlayCard>
  )
}
