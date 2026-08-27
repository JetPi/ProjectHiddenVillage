import { PlayCard } from '@/components/ui/game/PlayCard'
import { CardImage } from '@/components/ui/cards/CardImage'
import chakraCardImage from '@/assets/ChakraCard.webp'
import { twMerge } from 'tailwind-merge'
import type { IResourceChakraGridProps } from '@/components/ui/types'

const RESOURCE_CARD_FRAME_CLASS = 'overflow-hidden rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-muted)]'
const CHAKRA_CARD_IMAGE_CLASS = 'h-full w-full rounded-none object-cover p-0 [image-rendering:auto] [transform:translateZ(0)]'

export function ResourceChakraGrid({ cardClassName, className, slotClassName, slotCount = 5, topRowCount = 3 }: IResourceChakraGridProps) {
  const smallResourceCardSlots = Array.from({ length: slotCount }, (_, slotIndex) => slotIndex)
  const smallCardFrameClassName = twMerge(
    RESOURCE_CARD_FRAME_CLASS,
    cardClassName,
    'border-transparent',
    slotClassName,
  )

  return (
    <>
      <div className={twMerge('flex min-h-0 items-end justify-center gap-px', className)}>
        {smallResourceCardSlots.slice(0, topRowCount).map((slotIndex) => (
          <PlayCard
            key={`resource-small-top-${slotIndex}`}
            className={smallCardFrameClassName}
          >
            <CardImage
              src={chakraCardImage}
              alt="Chakra card"
              className={CHAKRA_CARD_IMAGE_CLASS}
            />
          </PlayCard>
        ))}
      </div>
      <div className={twMerge('flex min-h-0 items-start justify-center gap-px', className)}>
        {smallResourceCardSlots.slice(topRowCount).map((slotIndex) => (
          <PlayCard
            key={`resource-small-bottom-${slotIndex}`}
            className={smallCardFrameClassName}
          >
            <CardImage
              src={chakraCardImage}
              alt="Chakra card"
              className={CHAKRA_CARD_IMAGE_CLASS}
            />
          </PlayCard>
        ))}
      </div>
    </>
  )
}
