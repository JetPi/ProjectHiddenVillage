import { twMerge } from 'tailwind-merge'
import { PlayCard } from './PlayCard'
import { CardBack } from './CardBack'
import type { IPlayPileZoneProps } from './types'

function isDeckLabel(label: string): boolean {
  return label.trim().toLowerCase() === 'deck'
}

export function PlayPileZone({ labels, className, cardBackTone = 'blue' }: IPlayPileZoneProps) {
  const labeledPileCardClassName =
    'h-full flex items-center justify-center text-center overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[10px]'
  const deckPileCardClassName = 'h-full overflow-hidden rounded-lg'
  const columnCount = Math.max(labels.length, 1)

  return (
    <div className={twMerge('h-full w-full max-w-[250px] justify-self-center overflow-hidden px-1', className)}>
      <div
        className="grid h-full w-full justify-center justify-items-center gap-0.5"
        style={{ gridTemplateColumns: `repeat(${columnCount}, auto)` }}
      >
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
