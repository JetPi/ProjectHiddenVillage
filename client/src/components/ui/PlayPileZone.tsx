import { twMerge } from 'tailwind-merge'
import { PlayCard } from './PlayCard'
import { CardBack } from './CardBack'
import type { IPlayPileZoneProps } from './types'
import { CardOverlayBadge } from './CardOverlayBadge'

function isDeckLabel(label: string): boolean {
  return label.trim().toLowerCase() === 'deck'
}

function isTrashLabel(label: string): boolean {
  return label.trim().toLowerCase() === 'trash'
}

export function PlayPileZone({ labels, side, className, cardBackTone = 'blue', gameState, deckCardRef, trashCardRef }: IPlayPileZoneProps) {
  const labeledPileCardClassName =
    'h-full flex items-center justify-center text-center overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[10px]'
  const deckPileCardClassName = 'h-full overflow-hidden rounded-lg'
  const columnCount = Math.max(labels.length, 1)

  const currentPlayer = gameState?.currentPlayer
  const opponentPlayer = gameState?.opponentPlayer
  const deckLabelIndex = labels.findIndex((label) => isDeckLabel(label))
  const trashLabelIndex = labels.findIndex((label) => isTrashLabel(label))

  let deckCount = 0
  let trashCount = 0
  if (side === 'bottom' && currentPlayer) {
    deckCount = currentPlayer.deckCount
    trashCount = currentPlayer.trash.length
  } else if (opponentPlayer) {
    deckCount = opponentPlayer.deckCount
    trashCount = opponentPlayer.trash.length
  }
  
  return (
    <div
      data-side={side}
      className={twMerge(
        'h-full w-full max-w-[250px] justify-self-center overflow-hidden px-1',
        side === 'top' ? 'play-pile-zone-top' : 'play-pile-zone-bottom',
        className,
      )}
    >
      <div
        className="grid h-full w-full justify-center justify-items-center gap-0.5"
        style={{ gridTemplateColumns: `repeat(${columnCount}, auto)` }}
      >
        {labels.map((label, labelIndex) => {
          const badgeValue = isDeckLabel(label) ? deckCount : trashCount
          return (
            <PlayCard
              key={`pile-slot-${labelIndex}-${label}`}
              ref={
                isDeckLabel(label) && labelIndex === deckLabelIndex
                  ? deckCardRef
                  : isTrashLabel(label) && labelIndex === trashLabelIndex
                    ? trashCardRef
                    : undefined
              }
              className={isDeckLabel(label) ? deckPileCardClassName : labeledPileCardClassName}
            >
              <CardOverlayBadge
                className={twMerge(
                  badgeValue === 0 ? 'hidden' : '',
                  'h-5 w-5 border-slate-300/35 bg-slate-900/45 text-[10px] text-white',
                )}
                value={badgeValue}
              />
              {isDeckLabel(label) ? (
                <CardBack tone={cardBackTone} />
              ) : (
                label
              )}
            </PlayCard>
          )
        })}
      </div>
    </div>
  )
}
