import { twMerge } from 'tailwind-merge'
import { PlayCard } from './PlayCard'

type PlayPileZoneProps = {
  labels: [string, string, string]
  className?: string
}

export function PlayPileZone({ labels, className }: PlayPileZoneProps) {
  return (
    <div className={twMerge('h-full w-full max-w-full overflow-hidden px-1', className)}>
      <div className="grid h-full w-full grid-cols-3 gap-0.5">
        <PlayCard className="h-full w-full flex items-center justify-center text-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[10px]">
          {labels[0]}
        </PlayCard>
        <PlayCard className="h-full w-full flex items-center justify-center text-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[10px]">
          {labels[1]}
        </PlayCard>
        <PlayCard className="h-full w-full flex items-center justify-center text-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[10px]">
          {labels[2]}
        </PlayCard>
      </div>
    </div>
  )
}
