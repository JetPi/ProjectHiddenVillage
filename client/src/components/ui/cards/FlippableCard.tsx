import { motion } from 'motion/react'
import { twMerge } from 'tailwind-merge'
import { BOARD_MOVEMENT_EASE } from '@/views/game/animation/tuning'
import type { IFlippableCardProps } from '@/components/ui/types'

export function FlippableCard({
  isFlipped,
  front,
  back,
  className,
  innerClassName,
  frontClassName,
  backClassName,
  durationMs = 320,
}: IFlippableCardProps) {
  return (
    // `data-card-face` publishes which face is showing, so the flip is observable (and assertable): the two faces
    // are both in the DOM at all times, so nothing else in the markup distinguishes them.
    <div data-card-face={isFlipped ? 'front' : 'back'} className={twMerge('relative h-full w-full [perspective:920px]', className)}>
      <motion.div
        // Motion owns the flip: the 3D transform is animated declaratively instead of through a CSS
        // `transition-transform` class, so the card's transform has a single owner. `initial={false}` applies
        // the current face on mount (a card that is already flipped, e.g. a revealed deck card, must not
        // perform the flip as an entrance animation).
        initial={false}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: durationMs / 1000, ease: BOARD_MOVEMENT_EASE }}
        className={twMerge('relative h-full w-full [transform-style:preserve-3d]', innerClassName)}
      >
        <div
          className={twMerge('absolute inset-0 [backface-visibility:hidden]', backClassName)}
          aria-hidden={isFlipped}
        >
          {back}
        </div>
        <div
          className={twMerge(
            'absolute inset-0 [transform:rotateY(180deg)] [backface-visibility:hidden]',
            frontClassName,
          )}
          aria-hidden={!isFlipped}
        >
          {front}
        </div>
      </motion.div>
    </div>
  )
}
