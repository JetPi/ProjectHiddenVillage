import type { ICardAdminSelectedCardSummaryProps } from '@/views/admin/types/cardAdminSelectedCardSummary'

export function CardAdminSelectedCardSummary({ card }: ICardAdminSelectedCardSummaryProps) {
  return (
    <div className="mt-3 space-y-4 text-sm text-[var(--text-secondary)]">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <p>
          <span className="font-semibold text-[var(--text-primary)]">ID:</span> {card.id}
        </p>
        <p>
          <span className="font-semibold text-[var(--text-primary)]">Type:</span> {card.type}
        </p>
        <p className="sm:col-span-2">
          <span className="font-semibold text-[var(--text-primary)]">Name:</span> {card.displayName}
        </p>
        <p>
          <span className="font-semibold text-[var(--text-primary)]">Color:</span> {card.color}
        </p>
        <p>
          <span className="font-semibold text-[var(--text-primary)]">Power / Damage:</span> {card.power} / {card.damage}
        </p>
        <p>
          <span className="font-semibold text-[var(--text-primary)]">Effects:</span> {card.effects.length}
        </p>
      </div>

    </div>
  )
}
