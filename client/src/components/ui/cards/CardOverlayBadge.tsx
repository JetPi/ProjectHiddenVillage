import { twMerge } from 'tailwind-merge'
import type { ICardOverlayBadgeProps } from '@/components/ui/types'

const POSITION_CLASSES: Record<NonNullable<ICardOverlayBadgeProps['position']>, string> = {
  'top-left': 'top-0 left-0 rounded-br-md border-r border-b border-slate-500/65',
  'top-right': 'top-0 right-0 rounded-bl-md border-l border-b border-slate-500/65',
  'bottom-left': 'bottom-0 left-0 rounded-tr-md border-r border-t border-slate-500/65',
  'bottom-right': 'bottom-0 right-0 rounded-tl-md border-l border-t border-slate-500/65',
}

const SIZE_CLASSES = {
  sm: 'h-5 w-6 text-[10px]',
  md: 'h-6 w-6 text-xs',
  lg: 'h-7 w-7 text-xs',
} as const;

export function CardOverlayBadge({ size = "md", position = 'bottom-right', className, children }: ICardOverlayBadgeProps) {
  return (
    <div
      aria-label={`Card overlay value`}
      className={twMerge(
        'card-overlay-badge pointer-events-none absolute z-10 flex items-center justify-center bg-slate-700/92 text-center font-extrabold leading-none',
        SIZE_CLASSES[size],
        POSITION_CLASSES[position],
        className,
      )}
    >
      {children}
    </div>
  )
}