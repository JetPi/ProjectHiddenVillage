import { twMerge } from 'tailwind-merge'
import { useTranslation } from 'react-i18next'
import cardBackImage from '@/assets/CardBackside.webp'
import { CardImage } from '@/components/ui/cards/CardImage'
import { CARD_ART_ASPECT } from '@/services/api/cardArt'
import type { ICardBackProps } from '@/components/ui/types'

const CARD_BACK_FRAME_CLASS = 'h-full overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)]'
const CARD_BACK_IMAGE_CLASS = 'block h-full w-full rounded-none object-contain'

export function CardBack({ className }: ICardBackProps) {
  const { t } = useTranslation()

  return (
    <div className={twMerge(CARD_BACK_FRAME_CLASS, className)}>
      <CardImage
        src={cardBackImage}
        alt={t('components.ui.cardBack.alt')}
        // Same art box as a face-up card, so a back and a front reserve the same space and the back never has to be
        // stretched to fill a slot the front would not have grown into.
        width={CARD_ART_ASPECT.width}
        height={CARD_ART_ASPECT.height}
        loading="lazy"
        decoding="async"
        className={CARD_BACK_IMAGE_CLASS}
      />
    </div>
  )
}
