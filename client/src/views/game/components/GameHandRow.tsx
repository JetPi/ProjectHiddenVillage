import { AnimatePresence, motion } from 'motion/react'
import { twMerge } from 'tailwind-merge'
import { PlayRow } from '@/components/ui/game'
import { BOARD_MOVEMENT_EASE, DECK_TO_HAND_FLY_DURATION_MS } from '@/views/game/animation/tuning'
import type { IGameHandRowProps } from '@/views/game/types'

/**
 * The Motion wrapper carries the slot sizing (`h-full` + the card aspect), so the row's flex layout is owned
 * by the Motion element. That also keeps a dragged card's slot from collapsing: the reorder engine takes the
 * dragged card out of flow with `position: fixed`, and without the wrapper's own sizing the slot would
 * vanish and shove its siblings around.
 */
const HAND_CARD_SLOT_CLASSNAME = 'h-full w-auto shrink-0 aspect-[200/277]'

function GameHandRow<TCard>({
  cards,
  rowRef,
  renderCard,
  getCardKey,
  rowTestId,
  containerClassName,
  rowClassName,
  cardsContainerClassName,
  footer,
  footerClassName,
  isLayoutAnimationEnabled = true,
}: IGameHandRowProps<TCard>) {
  return (
    <div className={twMerge('flex min-h-0 items-stretch gap-1', containerClassName)}>
      <PlayRow className={twMerge('min-h-0 p-0 m-0 min-w-0 flex flex-1 flex-col rounded-2xl border border-dashed border-[var(--border-subtle)] p-1.5', rowClassName)}>
        <motion.div
          ref={rowRef}
          data-testid={rowTestId}
          className={twMerge(
            'flex h-full min-h-0 items-center justify-center gap-px overflow-visible [&_[data-hand-instance-id]]:h-[100%] [&_[data-hand-instance-id]_*]:outline-none [&_[data-hand-instance-id]_.border]:border-transparent [&_[data-hand-instance-id]_.border]:shadow-none',
            cardsContainerClassName,
          )}
        >
          <AnimatePresence initial={false}>
            {cards.map((card, index) => (
              <motion.div
                key={getCardKey(card, index)}
                // `layout="position"` animates only the slot: the card's own drawing scale is left alone (a
                // persistent fractional scale softens the art and its HUD text). Disabled while a card is being
                // dragged, because the reorder engine owns that card's position itself.
                layout={isLayoutAnimationEnabled ? 'position' : false}
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
