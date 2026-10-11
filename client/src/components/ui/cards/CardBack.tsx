import { twMerge } from 'tailwind-merge'
import { useTranslation } from 'react-i18next'
import cardBackImage from '@/assets/CardBackside.webp'
import { CardImage } from '@/components/ui/cards/CardImage'
import type { ICardBackProps } from '@/components/ui/types'

const CARD_BACK_FRAME_CLASS = 'h-full overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)]'
const CARD_BACK_IMAGE_CLASS = 'block h-full w-full rounded-none object-contain [image-rendering:auto]'

export function CardBack({ className }: ICardBackProps) {
  const { t } = useTranslation()

  return (
    <div className={twMerge(CARD_BACK_FRAME_CLASS, className)}>
      <CardImage
        src={cardBackImage}
        alt={t('components.ui.cardBack.alt')}
        loading="lazy"
        decoding="async"
        className={CARD_BACK_IMAGE_CLASS}
      />
    </div>
  )
}