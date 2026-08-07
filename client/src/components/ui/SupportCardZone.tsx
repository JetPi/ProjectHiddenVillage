import { twMerge } from 'tailwind-merge'
import { PlayCard } from './PlayCard'

type SupportCardZoneProps = {
  className?: string
  slotClassName?: string
}

export function SupportCardZone({
  className,
  slotClassName = 'h-full rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)]',
}: SupportCardZoneProps) {
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
