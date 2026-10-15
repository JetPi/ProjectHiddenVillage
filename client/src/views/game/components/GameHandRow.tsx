import { AnimatePresence, Reorder, motion } from 'motion/react'
import { twMerge } from 'tailwind-merge'
import { PlayRow } from '@/components/ui/game'
import { HandCardItem } from './HandCardItem'
import type { IGameHandRowProps } from '@/views/game/types'

/**
 * The slot wrapper carries the sizing (`h-full` + the card aspect), so the row's flex layout is owned by the
 * slot rather than by the card inside it. That keeps a slot from collapsing while its card enters or leaves.
 */
const HAND_CARD_SLOT_CLASSNAME = 'h-full w-auto shrink-0 aspect-[200/277]'
const CARDS_CONTAINER_CLASSNAME =
  'flex h-full min-h-0 items-center justify-center gap-px overflow-visible [&_[data-hand-instance-id]]:h-[100%] [&_[data-hand-instance-id]_*]:outline-none [&_[data-hand-instance-id]_.border]:border-transparent [&_[data-hand-instance-id]_.border]:shadow-none'

function GameHandRow<TCard>({
  cards,
  rowRef,
  renderCard,
  getCardKey,
  rowTestId,
  containerClassName,
  rowClassName,
  cardsContainerClassName,
  reorder,
  footer,
  footerClassName,
}: IGameHandRowProps<TCard>) {
  const cardsContainerClassNameResolved = twMerge(CARDS_CONTAINER_CLASSNAME, cardsContainerClassName)

  return (
    // `relative z-30` - a hand row's cards fly *out over the board* (a draw comes in from the pile, a discard goes
    // out to it), and the board is `position: relative`, so an unpositioned row painted underneath the whole board:
    // a card in the air was measured covered by a pile element (`plans/…`, probe `card-z-order`). Positioning the
    // row with a z-index above the board's own layers puts its cards - including the airborne one - over the board,
    // while the attack-link arrow (z-35) and every overlay (z-40 and up) stay above them.
    <div className={twMerge('relative z-30 flex min-h-0 items-stretch gap-1', containerClassName)}>
      <PlayRow className={twMerge('min-h-0 p-0 m-0 min-w-0 flex flex-1 flex-col rounded-2xl border border-dashed border-[var(--border-subtle)] p-1.5', rowClassName)}>
        {reorder ? (
          // Reorder.Group owns the cards' positions: the dragged card is transformed in place and the other
          // slots are laid out by projection, so nothing leaves the flow and no ancestor transform can
          // displace a lifted card.
          <Reorder.Group
            as="div"
            ref={rowRef}
            data-testid={rowTestId}
            axis="x"
            values={reorder.values}
            onReorder={reorder.onReorder}
            className={cardsContainerClassNameResolved}
          >
            <AnimatePresence initial={false}>
              {cards.map((card, index) => {
                const cardKey = getCardKey(card, index)
                return (
                  <HandCardItem
                    key={cardKey}
                    value={cardKey}
                    isDraggable={reorder.isDraggableCard(card)}
                    isActive={reorder.activeValue === cardKey}
                    className={HAND_CARD_SLOT_CLASSNAME}
                    onDragStateChange={reorder.onDragStateChange}
                  >
                    {renderCard(card, index)}
                  </HandCardItem>
                )
              })}
            </AnimatePresence>
          </Reorder.Group>
        ) : (
          <motion.div
            ref={rowRef}
            data-testid={rowTestId}
            className={cardsContainerClassNameResolved}
          >
            <AnimatePresence initial={false}>
              {cards.map((card, index) => (
                <motion.div
                  key={getCardKey(card, index)}
                  // `layout="position"` animates only the slot: the card's own drawing scale is left alone (a
                  // persistent fractional scale softens the art and its HUD text). Deliberately no entrance or
                  // exit animation - see `HandCardItem`, a hand card is revealed by the flight that carries it.
                  layout="position"
                  className={HAND_CARD_SLOT_CLASSNAME}
                >
                  {renderCard(card, index)}
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}

        {footer ? (
          <div className={twMerge('mt-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]', footerClassName)}>
            {footer}
          </div>
        ) : null}
      </PlayRow>

      <div aria-hidden className="w-6 shrink-0" />
    </div>
  )
}

export { GameHandRow }
