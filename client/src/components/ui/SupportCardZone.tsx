import { twMerge } from 'tailwind-merge'
import { PlayCard } from './PlayCard'
import type { ISupportCardZoneProps } from './types'

export function SupportCardZone({
  className,
  slotClassName = 'h-full rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)]',
}: ISupportCardZoneProps) {
  return (
    <div className={twMerge('grid min-h-0 w-full overflow-hidden grid-cols-5 justify-items-center gap-1.5', className)}>
      <PlayCard className={slotClassName} />
      <PlayCard className={slotClassName} />
      <PlayCard className={slotClassName} />
      <PlayCard className={slotClassName} />
      <PlayCard className={slotClassName} />
    </div>
  )
}
