import { useTranslation } from 'react-i18next'
import type { ICardAdminSelectedCardSummaryProps } from '@/views/admin/types/cardAdminDetailTypes'
import { CardAdminSelect } from '@/views/admin/components/controls'
import { optionLabel, PREDICATE_CARD_COLOR_LABEL_KEYS, PREDICATE_CARD_TYPE_LABEL_KEYS } from '@/views/admin/constants'

const CARD_TYPE_OPTIONS = ['Leader', 'Character', 'EX Character', 'Chakra', 'Summon'] as const
const CARD_COLOR_OPTIONS = ['Red', 'Blue', 'Green', 'N/A'] as const

const CARD_TYPE_LABEL_KEYS: Readonly<Record<string, string>> = {
  ...PREDICATE_CARD_TYPE_LABEL_KEYS,
  'EX Character': 'admin.options.predicateCardType.exCharacter',
}

const CARD_COLOR_LABEL_KEYS: Readonly<Record<string, string>> = {
  ...PREDICATE_CARD_COLOR_LABEL_KEYS,
  'N/A': 'admin.options.predicateCardColor.notApplicable',
}

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
  identity,
  onTypeChange,
  onColorChange,
  onPowerChange,
  onDamageChange,
  onLifeChange,
  onHealthChange,
}: ICardAdminSelectedCardSummaryProps) {
  const { t } = useTranslation()

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

  const resolvedCardId = identity ? identity.cardId : formatValue(card.id)
  const resolvedDisplayName = identity ? identity.displayName : formatValue(card.displayName)

  const statRows = [
    [t('admin.detail.summary.id'), resolvedCardId],
  ]

  return (
    <div className="flex h-full flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-3 text-sm text-[var(--text-secondary)]">
      <div className="flex items-stretch gap-2">
        <div className="min-w-0 flex-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2">
          <label
            className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]"
            htmlFor={identity ? 'card-admin-create-display-name' : undefined}
          >
            {t('admin.detail.summary.name')}
          </label>
          {identity ? (
            <input
              id="card-admin-create-display-name"
              value={identity.displayName}
              onChange={(event) => identity.onDisplayNameChange(event.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface)] px-2 py-1 text-sm font-semibold text-[var(--text-primary)]"
            />
          ) : (
            <p className="truncate text-sm font-semibold text-[var(--text-primary)]" title={resolvedDisplayName}>{resolvedDisplayName}</p>
          )}
        </div>

        <div className="w-fit shrink-0 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{t('admin.detail.summary.supportCost')}</p>
          <p className="mt-0.5 text-right text-sm font-semibold tabular-nums text-[var(--text-primary)]">{formatValue(card.supportCost)}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {identity ? (
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-2 py-2">
            <label
              className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
              htmlFor="card-admin-create-card-id"
            >
              {t('admin.detail.summary.id')}
            </label>
            <input
              id="card-admin-create-card-id"
              value={identity.cardId}
              onChange={(event) => identity.onCardIdChange(event.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)]"
            />
          </div>
        ) : (
          statRows.map(([label, value]) => (
            <div
              key={label}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-2 py-2"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
              <p className="mt-0.5 text-sm font-medium text-[var(--text-primary)]">{value}</p>
            </div>
          ))
        )}

        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-2 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{t('admin.detail.summary.type')}</p>
          <CardAdminSelect
            value={draft.type}
            onValueChange={(value) => onTypeChange(value)}
            className="mt-1 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)]"
          >
            {CARD_TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>{optionLabel(t, CARD_TYPE_LABEL_KEYS, option)}</option>
            ))}
          </CardAdminSelect>
        </div>

        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-2 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{t('admin.detail.summary.color')}</p>
          <CardAdminSelect
            value={draft.color}
            onValueChange={(value) => onColorChange(value)}
            className="mt-1 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)]"
          >
            {CARD_COLOR_OPTIONS.map((option) => (
              <option key={option} value={option}>{optionLabel(t, CARD_COLOR_LABEL_KEYS, option)}</option>
            ))}
          </CardAdminSelect>
        </div>

        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-2 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{t('admin.detail.summary.power')}</p>
          <input
            type="number"
            min={0}
            value={draft.power}
            onChange={(event) => onPowerChange(parseStatInteger(event.target.value, draft.power))}
            className="mt-1 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)]"
          />
        </div>

        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-2 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{t('admin.detail.summary.damage')}</p>
          <input
            type="number"
            min={0}
            value={draft.damage}
            onChange={(event) => onDamageChange(parseStatInteger(event.target.value, draft.damage))}
            className="mt-1 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)]"
          />
        </div>

        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-2 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{isLeaderType ? t('admin.detail.summary.life') : t('admin.detail.summary.health')}</p>
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
