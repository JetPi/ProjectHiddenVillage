import { twMerge } from 'tailwind-merge'
import cardBackImage from '../../assets/CardBackside.png'

export type CardBackTone = 'blue' | 'orange'

type CardBackProps = {
  tone?: CardBackTone
  className?: string
}

const BLUE_TONE_CLASS = 'bg-[#2e5fd4]'

const ORANGE_TONE_CLASS = 'bg-[#d87433]'

export function CardBack({ tone = 'blue', className }: CardBackProps) {
  const toneClassName = tone === 'orange' ? ORANGE_TONE_CLASS : BLUE_TONE_CLASS

  return (
    <div className={twMerge('h-full w-full overflow-hidden rounded-lg border-[3px] border-white', toneClassName, className)}>
      <img
        src={cardBackImage}
        alt="Card back"
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover"
      />
    </div>
  )
}