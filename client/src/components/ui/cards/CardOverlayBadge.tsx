import { twMerge } from 'tailwind-merge'
import type { ICardOverlayBadgeProps } from '@/components/ui/types'

export function CardOverlayBadge({ value, className }: ICardOverlayBadgeProps) {
  return (
    <div
      aria-label={`Card overlay value ${value}`}
      className={twMerge(
        'pointer-events-none absolute bottom-0 right-0 z-10 flex h-7 w-7 rounded-tl-md items-center justify-center border-l border-t border-slate-500/65 bg-slate-700/92 text-center text-xs font-extrabold leading-none text-green-300',
        className,
      )}
    >
      {value}
    </div>
  )
}