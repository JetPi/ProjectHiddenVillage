import { forwardRef } from 'react'
import { twMerge } from 'tailwind-merge'
import { CARD_ART_ASPECT_CLASS } from '@/components/ui/cards/constants'
import type { IPlayCardProps } from '@/components/ui/types'

export const PlayCard = forwardRef<HTMLDivElement, IPlayCardProps>(function PlayCard(
  { className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      // The frame ratio is the art's own ratio (`CARD_ART_ASPECT_CLASS`), which is what keeps a card from
      // letterboxing or cropping when it is scaled by the board layout.
      className={twMerge('relative w-auto max-w-full', CARD_ART_ASPECT_CLASS, className)}
      {...rest}
    >
      {children}
    </div>
  )
})
