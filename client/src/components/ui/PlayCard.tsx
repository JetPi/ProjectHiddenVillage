import { forwardRef } from 'react'
import { twMerge } from 'tailwind-merge'
import type { IPlayCardProps } from './types'

export const PlayCard = forwardRef<HTMLDivElement, IPlayCardProps>(function PlayCard(
  { className, children },
  ref,
) {
  return (
    <div ref={ref} className={twMerge('relative w-auto max-w-full aspect-[200/277] object-cover', className)}>
      {children}
    </div>
  )
})
