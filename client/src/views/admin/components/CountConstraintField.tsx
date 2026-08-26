import type { ICountConstraintFieldProps, ICountConstraintMode } from '@/views/admin/types/countConstraintField'
import { CardAdminSelect } from '@/views/admin/components/CardAdminSelect'

function parseNullableInteger(value: string): number | null {
  const nextValue = value.trim()
  if (!nextValue) {
    return null
  }

  const parsed = Number.parseInt(nextValue, 10)
  return Number.isFinite(parsed) ? parsed : null
}

export function CountConstraintField({
  mode,
  value,
  onModeChange,
  onValueChange,
  modeLabel,
  valueLabel,
  min = 0,
  step = 1,
  inputMode = 'numeric',
  placeholder,
  className,
  selectClassName,
  inputClassName,
  trailingContent,
}: ICountConstraintFieldProps) {
  const displayValue = value === null ? '' : String(value)
  const placeholderLength = placeholder?.length ?? 0
  const minLength = String(min).length
  const valueCharacters = Math.max(displayValue.length, placeholderLength, minLength, 1)
  const resolvedInputClassName = inputClassName
    ? `count-constraint-number block ${inputClassName}`
    : `count-constraint-number block w-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] ${trailingContent ? 'sm:col-span-2' : ''}`

  const selectControl = (
    <CardAdminSelect
      value={mode}
      onChange={(event) => onModeChange(event.target.value as ICountConstraintMode)}
      className={selectClassName ? `block ${selectClassName}` : 'block w-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]'}
    >
      <option value="Exact">Exact</option>
      <option value="Minimum">Minimum</option>
      <option value="Maximum">Maximum</option>
      <option value="All">All</option>
    </CardAdminSelect>
  )

  const valueControl = mode === 'All'
    ? (
      <div className={resolvedInputClassName} style={{ minWidth: '6.5rem' }}>
        All in zone
      </div>
    )
    : (
    <input
      type="number"
      min={min}
      step={step}
      inputMode={inputMode}
      placeholder={placeholder}
      value={value ?? ''}
      onChange={(event) => onValueChange(parseNullableInteger(event.target.value))}
      className={resolvedInputClassName}
      style={{ width: `${valueCharacters + 6}ch`, minWidth: '6.5rem' }}
    />
    )

  return (
    <div className={className ?? (trailingContent ? 'grid w-fit grid-cols-1 gap-2 sm:grid-cols-4' : 'grid w-fit grid-cols-1 gap-2 sm:grid-cols-2')}>
      {modeLabel ? (
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{modeLabel}</label>
          {selectControl}
        </div>
      ) : selectControl}

      {trailingContent ? trailingContent : null}

      {valueLabel ? (
        <div className={`space-y-1 ${trailingContent ? 'sm:col-span-2' : ''}`}>
          <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{valueLabel}</label>
          {valueControl}
        </div>
      ) : valueControl}
    </div>
  )
}
