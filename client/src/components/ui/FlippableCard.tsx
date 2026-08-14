import { twMerge } from 'tailwind-merge'
import type { IFlippableCardProps } from './types'

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
    <div className={twMerge('relative h-full w-full [perspective:920px]', className)}>
      <div
        className={twMerge(
          'relative h-full w-full [transform-style:preserve-3d] transition-transform ease-[cubic-bezier(0.22,1,0.36,1)]',
          isFlipped ? '[transform:rotateY(180deg)]' : '[transform:rotateY(0deg)]',
          innerClassName,
        )}
        style={{ transitionDuration: `${durationMs}ms` }}
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
      </div>
    </div>
  )
}
