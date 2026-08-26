import { useState } from 'react'
import { FormInput, FormLabel, FormSelect } from '@/components/forms'
import type { ICardAdminFilterPanelProps } from '@/views/admin/types/cardAdminFilterPanel'
import { CardAdminSelect } from '@/views/admin/components/controls/CardAdminSelect'
import { CardAdminRemoveButton } from '@/views/admin/components/controls/CardAdminRemoveButton'

export function CardAdminFilterPanel({
  searchText,
  typeValues,
  colorValues,
  sortValue,
  typeOptions,
  colorOptions,
  sortOptions,
  onSearchTextChange,
  onTypeChange,
  onColorChange,
  onSortChange,
}: ICardAdminFilterPanelProps) {
  const [pendingTypeSelection, setPendingTypeSelection] = useState('')
  const [pendingColorSelection, setPendingColorSelection] = useState('')

  const selectableTypeOptions = typeOptions.filter((option) => option.value !== 'all')
  const selectableColorOptions = colorOptions.filter((option) => option.value !== 'all')
  const selectedTypeOptions = selectableTypeOptions.filter((option) => typeValues.includes(option.value))
  const selectedColorOptions = selectableColorOptions.filter((option) => colorValues.includes(option.value))

  const availableTypeOptions = selectableTypeOptions.filter((option) => !typeValues.includes(option.value))
  const availableColorOptions = selectableColorOptions.filter((option) => !colorValues.includes(option.value))

  return (
    <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-2.5">
      <div className="space-y-1">
        <FormLabel htmlFor="card-admin-search" className="text-[10px] tracking-[0.12em]">
          Search
        </FormLabel>
        <FormInput
          id="card-admin-search"
          value={searchText}
          placeholder="Search"
          onChange={(event) => onSearchTextChange(event.target.value)}
          className="py-2"
        />
      </div>

      <div className="space-y-1">
        <FormLabel className="text-[10px] tracking-[0.12em]">
          Type
        </FormLabel>
        <CardAdminSelect
          value={pendingTypeSelection}
          disabled={availableTypeOptions.length === 0}
          onChange={(event) => {
            const nextValue = event.target.value
            setPendingTypeSelection(nextValue)

            if (!nextValue) {
              return
            }

            if (!typeValues.includes(nextValue)) {
              onTypeChange([...typeValues, nextValue])
            }

            setPendingTypeSelection('')
          }}
          className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--field-bg)] px-4 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--focus-ring)] focus:outline-none disabled:cursor-not-allowed"
        >
          <option value="">{availableTypeOptions.length === 0 ? 'All selected' : 'All types'}</option>
          {availableTypeOptions.length > 0 ? (
            availableTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))
          ) : null}
        </CardAdminSelect>
      </div>

      <div className="space-y-1">
        <FormLabel className="text-[10px] tracking-[0.12em]">
          Color
        </FormLabel>
        <CardAdminSelect
          value={pendingColorSelection}
          disabled={availableColorOptions.length === 0}
          onChange={(event) => {
            const nextValue = event.target.value
            setPendingColorSelection(nextValue)

            if (!nextValue) {
              return
            }

            if (!colorValues.includes(nextValue)) {
              onColorChange([...colorValues, nextValue])
            }

            setPendingColorSelection('')
          }}
          className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--field-bg)] px-4 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--focus-ring)] focus:outline-none disabled:cursor-not-allowed"
        >
          <option value="">{availableColorOptions.length === 0 ? 'All selected' : 'All colors'}</option>
          {availableColorOptions.length > 0 ? (
            availableColorOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))
          ) : null}
        </CardAdminSelect>
      </div>

      <div className="col-span-3 flex min-h-6 flex-wrap items-center gap-1.5">
        {selectedTypeOptions.map((option) => (
          <div
            key={`type-${option.value}`}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] text-[var(--text-primary)]"
          >
            <span className="text-[var(--text-secondary)]">Type:</span>
            <span>{option.label}</span>
            <CardAdminRemoveButton
              variant="chip"
              onClick={() => onTypeChange(typeValues.filter((value) => value !== option.value))}
              ariaLabel={`Remove type ${option.label}`}
            />
          </div>
        ))}

        {selectedColorOptions.map((option) => (
          <div
            key={`color-${option.value}`}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] text-[var(--text-primary)]"
          >
            <span className="text-[var(--text-secondary)]">Color:</span>
            <span>{option.label}</span>
            <CardAdminRemoveButton
              variant="chip"
              onClick={() => onColorChange(colorValues.filter((value) => value !== option.value))}
              ariaLabel={`Remove color ${option.label}`}
            />
          </div>
        ))}
      </div>

      <div className="col-span-3 space-y-1">
        <FormLabel htmlFor="card-admin-sort" className="text-[10px] tracking-[0.12em]">
          Sort
        </FormLabel>
        <FormSelect
          id="card-admin-sort"
          value={sortValue}
          options={sortOptions}
          onValueChange={onSortChange}
          className="py-2"
        />
      </div>
    </div>
  )
}
