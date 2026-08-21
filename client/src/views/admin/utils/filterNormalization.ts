import { ALL_FILTER_OPTION } from '@/views/admin/utils/constants'
import type { ICardAdminFilterOption } from '@/views/admin/types/cardAdminView'

export function normalizeFilterValue(value: string | null | undefined): string {
  const normalizedValue = value?.trim().toLowerCase() ?? ''
  return normalizedValue || 'unknown'
}

export function toTitleCaseLabel(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter((entry) => entry.length > 0)
    .map((entry) => `${entry[0].toUpperCase()}${entry.slice(1).toLowerCase()}`)
    .join(' ')
}

export function buildUniqueFilterOptions(values: string[]): ICardAdminFilterOption[] {
  const normalizedValues = Array.from(new Set(values.map((value) => normalizeFilterValue(value))))
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))

  return [
    ALL_FILTER_OPTION,
    ...normalizedValues.map((value) => ({
      value,
      label: value === 'unknown' ? 'Unknown' : toTitleCaseLabel(value),
    })),
  ]
}
