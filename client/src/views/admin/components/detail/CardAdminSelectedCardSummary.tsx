import type { ICardAdminSelectedCardSummaryProps } from '@/views/admin/types/cardAdminSelectedCardSummary'
import { CardAdminSelect } from '@/views/admin/components/controls'

const CARD_TYPE_OPTIONS = ['Leader', 'Character', 'EX Character', 'Chakra', 'Summon'] as const
const CARD_COLOR_OPTIONS = ['Red', 'Blue', 'Green', 'N/A'] as const

function parseStatInteger(value: string, fallback: number): number {
  const nextValue = value.trim()
  if (!nextValue) {
    return fallback
  }

  const parsed = Number.parseInt(nextValue, 10)
  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.max(0, parsed)
}

export function CardAdminSelectedCardSummary({
  card,
  draft,
  onTypeChange,
  onColorChange,
  onPowerChange,
  onDamageChange,
  onLifeChange,
  onHealthChange,
}: ICardAdminSelectedCardSummaryProps) {
  const formatValue = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) {
      return '-'
    }

    if (typeof value === 'string' && value.trim().length === 0) {
      return '-'
    }

    return String(value)
  }

  const isLeaderType = draft.type.trim().toLowerCase() === 'leader'

  const statRows = [
    ['ID', formatValue(card.id)],
  ]

  return (
    <div className="flex h-full flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-3 text-sm text-[var(--text-secondary)]">
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

      <div className="mt-3 grid grid-cols-3 gap-2">
        {statRows.map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-2 py-2"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
            <p className="mt-0.5 text-sm font-medium text-[var(--text-primary)]">{value}</p>
          </div>
        ))}

        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-2 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Type</p>
          <CardAdminSelect
            value={draft.type}
            onChange={(event) => onTypeChange(event.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)]"
          >
            {CARD_TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </CardAdminSelect>
        </div>

        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-2 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Color</p>
          <CardAdminSelect
            value={draft.color}
            onChange={(event) => onColorChange(event.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)]"
          >
            {CARD_COLOR_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </CardAdminSelect>
        </div>

        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-2 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Power</p>
          <input
            type="number"
            min={0}
            value={draft.power}
            onChange={(event) => onPowerChange(parseStatInteger(event.target.value, draft.power))}
            className="mt-1 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)]"
          />
        </div>

        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-2 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Damage</p>
          <input
            type="number"
            min={0}
            value={draft.damage}
            onChange={(event) => onDamageChange(parseStatInteger(event.target.value, draft.damage))}
            className="mt-1 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)]"
          />
        </div>

        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-2 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{isLeaderType ? 'Life' : 'Health'}</p>
          <input
            type="number"
            min={0}
            value={isLeaderType ? (draft.life ?? 0) : (draft.health ?? 0)}
            onChange={(event) => {
              const parsedValue = parseStatInteger(
                event.target.value,
                isLeaderType ? (draft.life ?? 0) : (draft.health ?? 0),
              )

              if (isLeaderType) {
                onLifeChange(parsedValue)
                return
              }

              onHealthChange(parsedValue)
            }}
            className="mt-1 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)]"
          />
        </div>
      </div>
    </div>
  )
}
