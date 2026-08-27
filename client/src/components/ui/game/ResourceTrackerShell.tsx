import { twMerge } from 'tailwind-merge'
import type { IResourceTrackerShellProps } from '@/components/ui/types'

export function ResourceTrackerShell({ reverse = false, className, chakraContent, summonContent }: IResourceTrackerShellProps) {
  return (
    <div
      className={twMerge(
        'mx-auto grid min-h-0 w-full max-w-[var(--resource-rail-max-width)] min-w-0 gap-0.5 rounded-lg border border-dashed border-[var(--border-subtle)] p-px bg-[var(--surface-elevated)]',
        reverse ? 'grid-cols-[33%_66%]' : 'grid-cols-[66%_33%]',
        className,
      )}
    >
      <div
        className={twMerge(
          'grid min-h-0 w-full grid-rows-2 gap-px rounded-lg bg-[var(--surface-elevated)]',
          reverse ? 'order-2' : 'order-1',
        )}
      >
        {chakraContent}
      </div>

      <div className={twMerge('grid min-h-0 w-full place-items-center px-0.5', reverse ? 'order-1' : 'order-2')}>
        {summonContent}
      </div>
    </div>
  )
}
