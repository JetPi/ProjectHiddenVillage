import { twMerge } from 'tailwind-merge'
import cardBackImage from '../../assets/CardBackside.png'

export type CardBackTone = 'blue' | 'orange'

type CardBackProps = {
  tone?: CardBackTone
  className?: string
}

const CARD_BACK_FRAME_CLASS = 'h-full overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)]'
const CARD_BACK_IMAGE_CLASS = 'block h-full w-full rounded-none object-contain [image-rendering:auto]'

export function CardBack({ className }: CardBackProps) {
  return (
    <div className={twMerge(CARD_BACK_FRAME_CLASS, className)}>
      <img
        src={cardBackImage}
        alt="Card back"
        loading="lazy"
        decoding="async"
        className={CARD_BACK_IMAGE_CLASS}
      />
    </div>
  )
}