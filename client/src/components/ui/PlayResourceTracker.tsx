import { PlayCard } from './PlayCard'
import { twMerge } from 'tailwind-merge'

type PlayResourceTrackerProps = {
    cardClassName: string
    className?: string
    reverse?: boolean
}

export function PlayResourceTracker({ cardClassName, className, reverse = false }: PlayResourceTrackerProps) {
    return (
        <div className={twMerge('grid min-h-0 grid-cols-2 gap-px rounded-lg border border-dashed border-[var(--border-subtle)] p-px bg-[var(--surface-elevated)]', className)}>
            <div
                className={twMerge(
                    'grid min-h-0 grid-rows-2 gap-px rounded-lg p-px bg-[var(--surface-elevated)]',
                    reverse ? 'order-2' : 'order-1',
                )}
            >
                <div className="flex min-h-0 items-center justify-center gap-0.5">
                    <PlayCard className={`h-full max-h-full rounded-sm border border-[var(--border-subtle)] ${cardClassName}`} />
                    <PlayCard className={`h-full max-h-full rounded-sm border border-[var(--border-subtle)] ${cardClassName}`} />
                    <PlayCard className={`h-full max-h-full rounded-sm border border-[var(--border-subtle)] ${cardClassName}`} />
                </div>
                <div className="flex min-h-0 items-center justify-center gap-0.5">
                    <PlayCard className={`h-full max-h-full rounded-sm border border-[var(--border-subtle)] ${cardClassName}`} />
                    <PlayCard className={`h-full max-h-full rounded-sm border border-[var(--border-subtle)] ${cardClassName}`} />
                    <PlayCard className={`h-full max-h-full rounded-sm border border-[var(--border-subtle)] ${cardClassName}`} />
                </div>
            </div>

            <div className={twMerge('grid min-h-0 place-items-center', reverse ? 'order-1' : 'order-2')}>
                <PlayCard className={`h-full max-h-full rounded-sm border border-[var(--border-subtle)] ${cardClassName}`} />
            </div>
        </div>
    )
}
