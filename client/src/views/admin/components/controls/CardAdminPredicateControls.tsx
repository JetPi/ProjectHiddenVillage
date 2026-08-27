import { useMemo, useState } from 'react'
import { CardAdminSelect } from './CardAdminSelect'
import {
  PREDICATE_CARD_COLOR_VALUE_OPTIONS,
  PREDICATE_CARD_TYPE_VALUE_OPTIONS,
  PREDICATE_NUMERIC_PROPERTY_OPTIONS,
  PREDICATE_OPERATOR_OPTIONS,
  PREDICATE_PROPERTY_OPTIONS,
} from '@/views/admin/constants'
import type { ICardCatalogPredicateProperty } from '@/services/api/types/cardCatalog'
import type { ICardAdminPredicateControlsProps } from '@/views/admin/types/cardAdminPredicateControls'

export function CardAdminPredicateControls({
  predicateProperty,
  predicateOperator,
  predicateEntries,
  onPropertyChange,
  onOperatorChange,
  onAddValue,
}: ICardAdminPredicateControlsProps) {
  const [pendingEnumValue, setPendingEnumValue] = useState('')

  const enumOptions = useMemo(() => {
    if (predicateProperty === 'Type') {
      return PREDICATE_CARD_TYPE_VALUE_OPTIONS
    }

    if (predicateProperty === 'Color') {
      return PREDICATE_CARD_COLOR_VALUE_OPTIONS
    }

    return null
  }, [predicateProperty])

  const isNumericProperty = PREDICATE_NUMERIC_PROPERTY_OPTIONS.includes(predicateProperty)

  const normalizePredicateInput = (rawInput: string): string => {
    if (!isNumericProperty) {
      return rawInput
    }

    const numericEntries = rawInput
      .split(',')
      .map((value) => value.trim())
      .filter((value) => /^-?\d+(\.\d+)?$/.test(value))

    return numericEntries.join(', ')
  }

  return (
    <div className="flex flex-wrap items-start gap-2">
      <CardAdminSelect
        value={predicateProperty}
        onChange={(event) => {
          onPropertyChange(event.target.value as ICardCatalogPredicateProperty)
          setPendingEnumValue('')
        }}
        className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] sm:w-auto sm:min-w-[11rem]"
      >
        {PREDICATE_PROPERTY_OPTIONS.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </CardAdminSelect>

      <CardAdminSelect
        value={predicateOperator}
        onChange={(event) => onOperatorChange(event.target.value)}
        className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] sm:w-auto sm:min-w-[10rem]"
      >
        {PREDICATE_OPERATOR_OPTIONS.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </CardAdminSelect>

      {enumOptions ? (
        <div className="min-w-[14rem] flex-1">
          <CardAdminSelect
            value={pendingEnumValue}
            onChange={(event) => {
              const nextValue = event.target.value.trim()
              setPendingEnumValue('')

              if (!nextValue) {
                return
              }

              onAddValue(nextValue)
            }}
            className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
          >
            <option value="">Select value</option>
            {enumOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </CardAdminSelect>
        </div>
      ) : (
        <div className="min-w-[14rem] flex-1">
          <input
            type="text"
            inputMode={isNumericProperty ? 'decimal' : undefined}
            placeholder={
              predicateEntries.length > 0
                ? `Add value (current: ${predicateEntries.join(', ')})`
                : isNumericProperty
                  ? 'Add number and press Enter'
                  : 'Add value and press Enter'
            }
            onKeyDown={(event) => {
              if (event.key !== 'Enter') {
                return
              }

              event.preventDefault()
              const normalizedInput = normalizePredicateInput(event.currentTarget.value)
              if (!normalizedInput.trim()) {
                return
              }

              onAddValue(normalizedInput)
              event.currentTarget.value = ''
            }}
            className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
          />
        </div>
      )}
    </div>
  )
}
