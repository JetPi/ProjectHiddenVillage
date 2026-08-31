import { twMerge } from 'tailwind-merge'
import { PlayRow } from '@/components/ui/game'
import type { IGameHandRowProps } from '@/views/game/types/gameHandRow'

function GameHandRow<TCard>({
  cards,
  rowRef,
  renderCard,
  rowTestId,
  containerClassName,
  rowClassName,
  cardsContainerClassName,
  footer,
  footerClassName,
}: IGameHandRowProps<TCard>) {
  return (
    <div className={twMerge('flex min-h-0 items-stretch gap-1', containerClassName)}>
      <PlayRow className={twMerge('min-h-0 p-0 m-0 min-w-0 flex flex-1 flex-col rounded-2xl border border-dashed border-[var(--border-subtle)] p-1.5', rowClassName)}>
        <div
          ref={rowRef}
          data-testid={rowTestId}
          className={twMerge(
            'flex h-full min-h-0 items-center justify-center gap-px overflow-visible [&_[data-hand-instance-id]]:h-[100%] [&_[data-hand-instance-id]_*]:outline-none [&_[data-hand-instance-id]_.border]:border-transparent [&_[data-hand-instance-id]_.border]:shadow-none',
            cardsContainerClassName,
          )}
        >
          {cards.map((card, index) => renderCard(card, index))}
        </div>

        {footer ? (
          <div className={twMerge('mt-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]', footerClassName)}>
            {footer}
          </div>
        ) : null}
      </PlayRow>

      <div aria-hidden className="w-6 shrink-0" />
    </div>
  )
}

export { GameHandRow }