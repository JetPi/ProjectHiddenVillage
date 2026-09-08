import { twMerge } from 'tailwind-merge'
import type { ICardOverlayBadgeProps } from '@/components/ui/types'

const POSITION_CLASSES: Record<NonNullable<ICardOverlayBadgeProps['position']>, string> = {
  'top-left': 'top-0 left-0 rounded-br-md border-r border-b border-slate-500/65',
  'top-right': 'top-0 right-0 rounded-bl-md border-l border-b border-slate-500/65',
  'bottom-left': 'bottom-0 left-0 rounded-tr-md border-r border-t border-slate-500/65',
  'bottom-right': 'bottom-0 right-0 rounded-tl-md border-l border-t border-slate-500/65',
}

export function CardOverlayBadge({ value, position = 'bottom-right', className }: ICardOverlayBadgeProps) {
  return (
    <div
      aria-label={`Card overlay value ${value}`}
      className={twMerge(
        'pointer-events-none absolute z-10 flex h-7 w-7 items-center justify-center bg-slate-700/92 text-center text-xs font-extrabold leading-none text-green-300',
        POSITION_CLASSES[position],
        className,
      )}
    >
      {value}
    </div>
  )
}