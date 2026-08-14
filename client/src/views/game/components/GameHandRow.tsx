import { twMerge } from 'tailwind-merge'
import { PlayRow } from '../../../components/ui/PlayRow'
import type { IGameHandRowProps } from '../types/gameHandRow'

function GameHandRow<TCard>({
  cards,
  rowRef,
  renderCard,
  containerClassName,
  rowClassName,
  cardsContainerClassName,
  footer,
  footerClassName,
}: IGameHandRowProps<TCard>) {
  return (
    <div className={twMerge('grid min-h-0 grid-cols-[1fr_1.5rem] gap-1', containerClassName)}>
      <PlayRow className={twMerge('rounded-2xl border border-dashed border-[var(--border-subtle)] p-1.5', rowClassName)}>
        <div ref={rowRef} className={twMerge('flex h-full min-h-0 flex-wrap items-start gap-1.5 overflow-hidden', cardsContainerClassName)}>
          {cards.map((card, index) => renderCard(card, index))}
        </div>

        {footer ? (
          <div className={twMerge('mt-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]', footerClassName)}>
            {footer}
          </div>
        ) : null}
      </PlayRow>
    </div>
  )
}

export { GameHandRow }