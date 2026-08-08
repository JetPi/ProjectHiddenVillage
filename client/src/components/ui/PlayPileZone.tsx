import { twMerge } from 'tailwind-merge'
import { PlayCard } from './PlayCard'
import { CardBack, type ICardBackTone } from './CardBack'

type IPlayPileZoneProps = {
  labels: [string, string, string]
  className?: string
  cardBackTone?: ICardBackTone
}

function isDeckLabel(label: string): boolean {
  return label.trim().toLowerCase() === 'deck'
}

export function PlayPileZone({ labels, className, cardBackTone = 'blue' }: IPlayPileZoneProps) {
  const labeledPileCardClassName =
    'h-full w-full flex items-center justify-center text-center overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[10px]'
  const deckPileCardClassName = 'h-full w-full overflow-hidden rounded-lg'

  return (
    <div className={twMerge('h-full w-full max-w-full overflow-hidden px-1', className)}>
      <div className="grid h-full w-full grid-cols-3 gap-0.5">
        {labels.map((label, labelIndex) => (
          <PlayCard
            key={`pile-slot-${labelIndex}-${label}`}
            className={isDeckLabel(label) ? deckPileCardClassName : labeledPileCardClassName}
          >
            {isDeckLabel(label) ? (
              <CardBack tone={cardBackTone} />
            ) : (
              label
            )}
          </PlayCard>
        ))}
      </div>
    </div>
  )
}
