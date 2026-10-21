import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { translateKey } from '@/i18n'
import { CardAdminSelect } from './CardAdminSelect'
import {
  optionLabel,
  PREDICATE_CARD_COLOR_LABEL_KEYS,
  PREDICATE_CARD_COLOR_VALUE_OPTIONS,
  PREDICATE_CARD_TYPE_LABEL_KEYS,
  PREDICATE_CARD_TYPE_VALUE_OPTIONS,
  PREDICATE_NUMERIC_PROPERTY_OPTIONS,
  PREDICATE_OPERATOR_LABEL_KEYS,
  PREDICATE_OPERATOR_OPTIONS,
  PREDICATE_PROPERTY_LABEL_KEYS,
  PREDICATE_PROPERTY_OPTIONS,
} from '@/views/admin/constants'
import type { ICardCatalogPredicateProperty } from '@/services/api/types/cardCatalog'
import type { ICardAdminPredicateControlsProps } from '@/views/admin/types/cardAdminViewTypes'

export function CardAdminPredicateControls({
  predicateProperty,
  predicateOperator,
  predicateEntries,
  onPropertyChange,
  onOperatorChange,
  onAddValue,
}: ICardAdminPredicateControlsProps) {
  const { t } = useTranslation()
  const [pendingEnumValue, setPendingEnumValue] = useState('')

  const enumLabelKeys = predicateProperty === 'Type'
    ? PREDICATE_CARD_TYPE_LABEL_KEYS
    : PREDICATE_CARD_COLOR_LABEL_KEYS

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
    <div className="flex flex-wrap items-start gap-2" data-testid="predicate-controls">
      <div className="w-full sm:w-auto sm:min-w-[11rem]">
        <CardAdminSelect
          value={predicateProperty}
          onValueChange={(value) => {
            onPropertyChange(value as ICardCatalogPredicateProperty)
            setPendingEnumValue('')
          }}
          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
        >
          {PREDICATE_PROPERTY_OPTIONS.map((option) => (
            <option key={option} value={option}>{optionLabel(t, PREDICATE_PROPERTY_LABEL_KEYS, option)}</option>
          ))}
        </CardAdminSelect>
      </div>

      <div className="w-full sm:w-auto sm:min-w-[10rem]">
        <CardAdminSelect
          value={predicateOperator}
          onValueChange={(value) => onOperatorChange(value)}
          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
        >
          {PREDICATE_OPERATOR_OPTIONS.map((option) => (
            <option key={option} value={option}>{optionLabel(t, PREDICATE_OPERATOR_LABEL_KEYS, option)}</option>
          ))}
        </CardAdminSelect>
      </div>

      {enumOptions ? (
        <div className="min-w-[14rem] flex-1">
          <CardAdminSelect
            value={pendingEnumValue}
            onValueChange={(value) => {
              const nextValue = value.trim()
              setPendingEnumValue('')

              if (!nextValue) {
                return
              }

              onAddValue(nextValue)
            }}
            className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
          >
            <option value="">{t('admin.controls.predicate.selectValue')}</option>
            {enumOptions.map((option) => (
              <option key={option.value} value={option.value}>{optionLabel(t, enumLabelKeys, option.value)}</option>
            ))}
          </CardAdminSelect>
        </div>
      ) : (
        <div className="w-full min-w-[14rem] flex-1">
          <input
            type="text"
            inputMode={isNumericProperty ? 'decimal' : undefined}
            placeholder={
              predicateEntries.length > 0
                ? translateKey(t, 'admin.controls.predicate.addValueCurrent', { current: predicateEntries.join(', ') })
                : isNumericProperty
                  ? t('admin.controls.predicate.addNumber')
                  : t('admin.controls.predicate.addValue')
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
