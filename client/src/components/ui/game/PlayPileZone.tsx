import { Eye } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { PlayCard } from '@/components/ui/game/PlayCard'
import { CardBack } from '@/components/ui/cards/CardBack'
import { CardImage } from '@/components/ui/cards/CardImage'
import { CardOverlayBadge } from '@/components/ui/cards/CardOverlayBadge'
import { FlippableCard } from '@/components/ui/cards/FlippableCard'
import type { IPlayPileZoneProps } from '@/components/ui/types'

function isDeckLabel(label: string): boolean {
  return label.trim().toLowerCase() === 'deck'
}

function isTrashLabel(label: string): boolean {
  return label.trim().toLowerCase() === 'trash'
}

export function PlayPileZone({ labels, side, className, cardBackTone = 'blue', gameState, deckCardRef, trashCardRef, onOpenTrashPile }: IPlayPileZoneProps) {
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

  // A reveal turns one deck card face up for both players (the owner's deck list carries every card, the
  // opponent only receives their revealed ones), so the deck slot flips it over while the reveal lasts.
  const deckOwner = side === 'bottom' ? currentPlayer : opponentPlayer
  const revealedDeckInstance = deckOwner?.deck.find((card) => card.isRevealed === true) ?? null
  const revealedDeckCard = revealedDeckInstance
    ? (gameState?.cardById.get(revealedDeckInstance.cardDefinitionId.trim().toLowerCase()) ?? null)
    : null
  
  return (
    <div
      data-side={side}
      // `min-w-0 min-h-0` is load-bearing: the pile slots size themselves from the rail lane (`h-full` +
      // `aspect-[200/277]`), but a destination-side flight animation temporarily strips `overflow` from the
      // clipping ancestors (`resolveOverflowAncestors` in the animation helpers). Without the guard the freshly
      // rendered card art then inflates the whole pile grid to its min-content box - the slots grow to ~2.5x
      // their height for the length of the animation (the "massive card" flash). Same idiom as the support-slot
      // guard in `ZoneCardSlots`.
      className={twMerge(
        'h-full min-h-0 w-full min-w-0 max-w-[var(--resource-rail-max-width)] justify-self-center overflow-hidden px-1',
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
              className={
                isDeckLabel(label)
                  ? deckPileCardClassName
                  // `group` drives the trash slot's hover "eye" (same reveal pattern as a card's controls).
                  : twMerge(labeledPileCardClassName, isTrashLabel(label) ? 'group' : '')
              }
              data-testid={isTrashLabel(label) ? 'trash-pile-card' : isDeckLabel(label) ? 'deck-pile-card' : undefined}
              data-revealed={isDeckLabel(label) && revealedDeckInstance !== null ? 'true' : undefined}
              data-card-definition-id={
                isTrashLabel(label) && latestTrashCard
                  ? latestTrashCard.id
                  : isDeckLabel(label) && revealedDeckCard
                    ? revealedDeckCard.id
                    : undefined
              }
            >
              <CardOverlayBadge
                className={twMerge(
                  badgeValue === 0 ? 'hidden' : '',
                  'h-5 w-5 border-slate-300/35 bg-slate-900/45 text-[10px] text-white',
                )}
              >{badgeValue}</CardOverlayBadge>
              {isDeckLabel(label) ? (
                <FlippableCard
                  isFlipped={revealedDeckInstance !== null}
                  back={<CardBack className="border-0 bg-transparent [&_img]:object-cover" tone={cardBackTone} />}
                  front={
                    revealedDeckCard ? (
                      <CardImage
                        card={revealedDeckCard}
                        variant="board"
                        alt="Revealed deck card"
                        className="h-full w-full rounded-lg object-cover"
                      />
                    ) : null
                  }
                />
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
              {isTrashLabel(label) && onOpenTrashPile ? (
                <div className="card-overlay-controls pointer-events-none absolute inset-0 z-20 opacity-0 transition-opacity duration-200 ease-out group-hover:pointer-events-auto group-hover:opacity-100">
                  <button
                    type="button"
                    data-testid="trash-pile-viewer-button"
                    aria-label="Open trash pile"
                    onClick={onOpenTrashPile}
                    className="absolute right-2 top-2 z-30 inline-flex h-5 w-5 items-center justify-center rounded-sm border border-white/35 bg-black/65 text-white transition-colors duration-150 hover:bg-black/80"
                  >
                    <Eye size={10} />
                  </button>
                </div>
              ) : null}
            </PlayCard>
          )
        })}
      </div>
    </div>
  )
}
