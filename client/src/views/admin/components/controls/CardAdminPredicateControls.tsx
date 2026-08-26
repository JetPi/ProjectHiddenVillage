import { CardAdminSelect } from '@/views/admin/components/controls/CardAdminSelect'
import {
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
  return (
    <div className="flex flex-wrap items-start gap-2">
      <CardAdminSelect
        value={predicateProperty}
        onChange={(event) => onPropertyChange(event.target.value as ICardCatalogPredicateProperty)}
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

      <div className="min-w-[14rem] flex-1">
        <input
          type="text"
          placeholder={
            predicateEntries.length > 0
              ? `Add value (current: ${predicateEntries.join(', ')})`
              : 'Add value and press Enter'
          }
          onKeyDown={(event) => {
            if (event.key !== 'Enter') {
              return
            }

            event.preventDefault()
            onAddValue(event.currentTarget.value)
            event.currentTarget.value = ''
          }}
          className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
        />
      </div>
    </div>
  )
}
