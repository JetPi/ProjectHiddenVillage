import { PlayCard } from '@/components/ui/game/PlayCard'
import type { IResourceChakraGridProps } from '@/components/ui/types'
import { CardImage } from '@/components/ui/cards/CardImage'
import chakraCardImage from '@/assets/ChakraCard-hud.webp'
import cardBackImage from '@/assets/CardBackside-hud.webp'
import { twMerge } from 'tailwind-merge'
import { useTranslation } from 'react-i18next'

const RESOURCE_CARD_FRAME_CLASS = 'overflow-hidden rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-muted)]'
const CHAKRA_CARD_IMAGE_CLASS = 'h-full w-full rounded-none object-cover p-0'
const CHAKRA_HUD_WIDTH = 70
// Both HUD assets are drawn in the same frame, so they declare the same intrinsic box. They used to be 98 and 97,
// which made the back render one pixel shorter than the face it replaces.
const CHAKRA_HUD_HEIGHT = 98
// The chakra pool used to be pinned to a fixed rem width, so it ignored the viewport while every other card
// grew and shrank with the board. The size now follows the row, capped by a third of the row's width, and the
// width itself comes from `PlayCard`'s aspect ratio - so the cards scale with the board, keep their shape and
// never spill out of the resource rail, whatever the window height.
const CHAKRA_ROW_CLASS = 'flex h-full min-h-0 w-full items-end justify-center gap-px overflow-hidden [container-type:size]'
const CHAKRA_CARD_CLASS = 'h-[min(100cqh,calc((33cqw-1px)*277/200))] shrink-0'

export function ResourceChakraGrid({ currentChakra = 5, cardClassName, className, slotClassName, slotCount = 5, topRowCount = 3 }: IResourceChakraGridProps) {
  const { t } = useTranslation()
  const smallResourceCardSlots = Array.from({ length: slotCount }, (_, slotIndex) => slotIndex)
  const smallCardFrameClassName = twMerge(
    RESOURCE_CARD_FRAME_CLASS,
    CHAKRA_CARD_CLASS,
    cardClassName,
    'border-transparent',
    slotClassName,
  )

  return (
    <>
      <div className={twMerge(CHAKRA_ROW_CLASS, className)}>
        {smallResourceCardSlots.slice(0, topRowCount).map((slotIndex) => (
          <PlayCard
            key={`resource-small-top-${slotIndex}`}
            className={smallCardFrameClassName}
          >
            <CardImage
              src={slotIndex < currentChakra  ? chakraCardImage : cardBackImage}
              alt={t('components.game.chakraCard.alt')}
              width={CHAKRA_HUD_WIDTH}
              height={CHAKRA_HUD_HEIGHT}
              className={CHAKRA_CARD_IMAGE_CLASS}
            />
          </PlayCard>
        ))}
      </div>
      <div className={twMerge(CHAKRA_ROW_CLASS, 'items-start', className)}>
        {smallResourceCardSlots.slice(topRowCount).map((slotIndex) => (
          <PlayCard
            key={`resource-small-bottom-${slotIndex}`}
            className={smallCardFrameClassName}
          >
            <CardImage
              src={slotIndex < currentChakra  ? chakraCardImage : cardBackImage}
              alt={t('components.game.chakraCard.alt')}
              width={CHAKRA_HUD_WIDTH}
              height={CHAKRA_HUD_HEIGHT}
              className={CHAKRA_CARD_IMAGE_CLASS}
            />
          </PlayCard>
        ))}
      </div>
    </>
  )
}
