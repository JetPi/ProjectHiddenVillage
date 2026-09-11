import { twMerge } from 'tailwind-merge'
import { PlayCard } from '@/components/ui/game/PlayCard'
import { CardBack } from '@/components/ui/cards/CardBack'
import { CardImage } from '@/components/ui/cards/CardImage'
import { CardOverlayBadge } from '@/components/ui/cards/CardOverlayBadge'
import type { IPlayPileZoneProps } from '@/components/ui/types'

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

  const trashOwner = side === 'bottom' ? currentPlayer : opponentPlayer
  // The trash pile is ordered newest-first, so the most recently discarded card is the first entry.
  const latestTrashInstance = trashOwner && trashOwner.trash.length > 0
    ? trashOwner.trash[0]
    : null
  const latestTrashCard = latestTrashInstance
    ? (gameState?.cardById.get(latestTrashInstance.cardDefinitionId.trim().toLowerCase()) ?? null)
    : null
  
  return (
    <div
      data-side={side}
      className={twMerge(
        'h-full w-full max-w-[var(--resource-rail-max-width)] justify-self-center overflow-hidden px-1',
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
              data-testid={isTrashLabel(label) ? 'trash-pile-card' : undefined}
            >
              <CardOverlayBadge
                className={twMerge(
                  badgeValue === 0 ? 'hidden' : '',
                  'h-5 w-5 border-slate-300/35 bg-slate-900/45 text-[10px] text-white',
                )}
              >{badgeValue}</CardOverlayBadge>
              {isDeckLabel(label) ? (
                <CardBack className="border-0 bg-transparent [&_img]:object-cover" tone={cardBackTone} />
              ) : isTrashLabel(label) && latestTrashCard ? (
                <CardImage
                  card={latestTrashCard}
                  variant="board"
                  alt="Trash"
                  className="h-full w-full rounded-lg object-cover"
                />
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
