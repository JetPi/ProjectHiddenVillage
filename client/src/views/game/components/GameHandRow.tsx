import { AnimatePresence, Reorder, motion } from 'motion/react'
import { twMerge } from 'tailwind-merge'
import { PlayRow } from '@/components/ui/game'
import { BOARD_MOVEMENT_EASE, DECK_TO_HAND_FLY_DURATION_MS } from '@/views/game/animation/tuning'
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
    <div className={twMerge('flex min-h-0 items-stretch gap-1', containerClassName)}>
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
                  // persistent fractional scale softens the art and its HUD text).
                  layout="position"
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: DECK_TO_HAND_FLY_DURATION_MS / 1000, ease: BOARD_MOVEMENT_EASE }}
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
