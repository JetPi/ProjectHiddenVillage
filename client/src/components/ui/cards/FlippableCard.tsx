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
    <div data-card-face={isFlipped ? 'front' : 'back'} className={twMerge('relative h-full w-full [perspective:920px]', className)}>
      <motion.div
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
