import type { ICardAdminSelectedCardSummaryProps } from '@/views/admin/types/cardAdminSelectedCardSummary'

export function CardAdminSelectedCardSummary({ card }: ICardAdminSelectedCardSummaryProps) {
  const formatValue = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) {
      return '-'
    }

    if (typeof value === 'string' && value.trim().length === 0) {
      return '-'
    }

    return String(value)
  }

  const statRows = [
    ['ID', formatValue(card.id)],
    ['Type', formatValue(card.type)],
    ['Color', formatValue(card.color)],
    ['Power', formatValue(card.power)],
    ['Damage', formatValue(card.damage)],
    card.life !== null && card.life !== undefined
      ? ['Life', formatValue(card.life)]
      : ['Health', formatValue(card.health)],
  ]

  return (
    <div className="flex h-full flex-col justify-evenly rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-3 text-sm text-[var(--text-secondary)]">
      <div className="flex items-stretch gap-2">
        <div className="min-w-0 flex-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Name</p>
          <p className="truncate text-sm font-semibold text-[var(--text-primary)]" title={card.displayName}>{card.displayName}</p>
        </div>

        <div className="w-fit shrink-0 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Support Cost</p>
          <p className="mt-0.5 text-right text-sm font-semibold tabular-nums text-[var(--text-primary)]">{formatValue(card.supportCost)}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {statRows.map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-2 py-2"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
            <p className="mt-0.5 text-sm font-medium text-[var(--text-primary)]">{value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
