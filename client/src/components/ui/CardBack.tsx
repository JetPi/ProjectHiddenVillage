import { twMerge } from 'tailwind-merge'
import cardBackImage from '../../assets/CardBackside.png'
import { CardImage } from './CardImage'
import type { ICardBackProps } from './types'

const CARD_BACK_FRAME_CLASS = 'h-full overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)]'
const CARD_BACK_IMAGE_CLASS = 'block h-full w-full rounded-none object-contain [image-rendering:auto]'

export function CardBack({ className }: ICardBackProps) {
  return (
    <div className={twMerge(CARD_BACK_FRAME_CLASS, className)}>
      <CardImage
        src={cardBackImage}
        alt="Card back"
        loading="lazy"
        decoding="async"
        className={CARD_BACK_IMAGE_CLASS}
      />
    </div>
  )
}